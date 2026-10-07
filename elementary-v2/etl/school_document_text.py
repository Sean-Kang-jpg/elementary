"""Plain-text extraction for school documents (HWP 5, HWPX, PDF), tables as ' | ' rows.

Chosen over the 학교알리미 preview conversion on 2026-10-06: same output on HWPX, works on
HWP files the preview could not convert, and the original bytes stay the evidence.
"""
from __future__ import annotations

import re
import struct
import zipfile
import zlib
import xml.etree.ElementTree as ET


def file_format(data: bytes) -> str:
    if data[:5] == b'%PDF-':
        return 'pdf'
    if data[:4] == b'PK\x03\x04':
        return 'hwpx'
    if data[:8] == bytes.fromhex('d0cf11e0a1b11ae1'):
        return 'hwp'
    return 'unknown'


# ---------- HWPX ----------
def _local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def _cell_text(elem) -> str:
    return ' '.join(t.text.strip() for t in elem.iter() if _local(t.tag) == 't' and t.text and t.text.strip())


def _render_hwpx(elem, out: list[str]) -> None:
    tag = _local(elem.tag)
    if tag == 'tbl':
        for tr in elem:
            if _local(tr.tag) == 'tr':
                out.append(' | '.join(_cell_text(tc) for tc in tr if _local(tc.tag) == 'tc') + ' |')
        return
    if tag == 'p':
        buf: list[str] = []

        def walk(node) -> None:
            for child in node:
                name = _local(child.tag)
                if name == 'tbl':
                    if ''.join(buf).strip():
                        out.append(''.join(buf))
                    buf.clear()
                    _render_hwpx(child, out)
                elif name == 't':
                    buf.append(child.text or '')
                    buf.extend(grand.tail or '' for grand in child)
                else:
                    walk(child)

        walk(elem)
        if ''.join(buf).strip():
            out.append(''.join(buf))
        return
    for child in elem:
        _render_hwpx(child, out)


def hwpx_text(data: bytes) -> str:
    import io
    out: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if re.match(r'Contents/section\d+\.xml$', n)]
        for name in sorted(names, key=lambda n: int(re.findall(r'\d+', n)[-1])):
            _render_hwpx(ET.fromstring(archive.read(name)), out)
    return '\n'.join(out)


# ---------- HWP 5 ----------
_CTRL_HEADER, _PARA_TEXT, _LIST_HEADER, _TABLE = 71, 67, 72, 77
_WIDE_CONTROLS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}


def _records(data: bytes):
    i = 0
    while i + 4 <= len(data):
        header = struct.unpack_from('<I', data, i)[0]
        i += 4
        tag, level, size = header & 0x3FF, (header >> 10) & 0x3FF, header >> 20
        if size == 0xFFF:
            size = struct.unpack_from('<I', data, i)[0]
            i += 4
        yield tag, level, data[i:i + size]
        i += size


def _para_text(payload: bytes) -> str:
    chars, i = [], 0
    while i + 2 <= len(payload):
        code = struct.unpack_from('<H', payload, i)[0]
        if code in _WIDE_CONTROLS:
            i += 16  # extended/inline control occupies 8 wchars
            continue
        if 0xD800 <= code < 0xDC00 and i + 4 <= len(payload):
            low = struct.unpack_from('<H', payload, i + 2)[0]
            if 0xDC00 <= low < 0xE000:
                chars.append(chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)))
                i += 4
                continue
        if 0xD800 <= code < 0xE000:  # lone surrogate: not encodable, drop it
            i += 2
            continue
        chars.append('\n' if code in (10, 13) else ('' if code < 32 else chr(code)))
        i += 2
    return ''.join(chars).strip('\n')


def _table_lines(table: dict) -> list[str]:
    return [' | '.join(c['text'] for _, c in sorted(cells, key=lambda x: x[0])) + ' |' for _, cells in sorted(table['rows'].items())]


def hwp_text(data: bytes) -> str:
    import io
    import olefile
    ole = olefile.OleFileIO(io.BytesIO(data))
    compressed = bool(struct.unpack_from('<I', ole.openstream('FileHeader').read(), 36)[0] & 1)
    sections = sorted((s for s in ole.listdir() if s[0] == 'BodyText'), key=lambda s: int(s[1][7:]))
    out: list[str] = []
    for section in sections:
        body = ole.openstream(section).read()
        if compressed:
            body = zlib.decompress(body, -15)
        tables: list[dict] = []
        pending_level = None
        for tag, level, payload in _records(body):
            while tables and level <= tables[-1]['level']:
                lines = _table_lines(tables.pop())
                if tables and tables[-1]['cell'] is not None:
                    tables[-1]['cell']['text'] += ' ' + ' / '.join(lines)
                else:
                    out.extend(lines)
            if tag == _CTRL_HEADER and payload[:4][::-1] == b'tbl ':
                pending_level = level
            elif tag == _TABLE and pending_level is not None:
                tables.append({'level': pending_level, 'rows': {}, 'cell': None})
                pending_level = None
            elif tag == _LIST_HEADER and tables and level == tables[-1]['level'] + 1 and len(payload) >= 12:
                col, row = struct.unpack_from('<HH', payload, 8)
                cell = {'text': ''}
                tables[-1]['rows'].setdefault(row, []).append((col, cell))
                tables[-1]['cell'] = cell
            elif tag == _PARA_TEXT:
                text = _para_text(payload)
                if tables and tables[-1]['cell'] is not None:
                    cell = tables[-1]['cell']
                    cell['text'] += (' ' if cell['text'] else '') + text.replace('\n', ' ')
                elif text.strip():
                    out.append(text)
        while tables:
            out.extend(_table_lines(tables.pop()))
    return '\n'.join(out)


def pdf_text(data: bytes) -> str:
    import io
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = []
    for number, page in enumerate(reader.pages, 1):
        try:
            pages.append(f'##### PAGE {number}\n' + (page.extract_text() or ''))
        except Exception:  # a broken page should not hide the rest
            pages.append(f'##### PAGE {number}\n')
    return '\n'.join(pages)


def extract_text(data: bytes) -> tuple[str, str]:
    kind = file_format(data)
    if kind == 'pdf':
        return kind, pdf_text(data)
    if kind == 'hwpx':
        return kind, hwpx_text(data)
    if kind == 'hwp':
        return kind, hwp_text(data)
    return kind, ''
