"""Document text with table grids kept (HWP 5, HWPX), for the v3 after-school extraction.

school_document_text.py joins each table row's cells in file order, so a cell merged across rows
(a 요일 or 강좌명 spanning several 반) appears once and the rows below it shift left; the extractor
then had to guess which day a class belonged to. Both formats store each cell's row, column and
span, so here every table is laid out on its grid: a cell spanning rows is repeated on each row it
covers, a cell spanning columns fills the first and leaves the rest empty, so columns line up.

PDF has no cell structure; it falls back to school_document_text.pdf_text.
"""
from __future__ import annotations

import io
import re
import struct
import zipfile
import zlib
import xml.etree.ElementTree as ET

from etl.school_document_text import _para_text, _records, file_format, pdf_text

_CTRL_HEADER, _PARA_TEXT, _LIST_HEADER, _TABLE = 71, 67, 72, 77


def render_grid(cells: list[dict]) -> list[str]:
    """cells: {'row', 'col', 'rowspan', 'colspan', 'text'} -> ' | ' joined lines on the full grid."""
    if not cells:
        return []
    height = max(c['row'] + max(c['rowspan'], 1) for c in cells)
    width = max(c['col'] + max(c['colspan'], 1) for c in cells)
    grid = [[''] * width for _ in range(height)]
    for c in cells:
        for r in range(c['row'], c['row'] + max(c['rowspan'], 1)):
            grid[r][c['col']] = c['text']
    lines = []
    for row in grid:
        while row and not row[-1]:
            row = row[:-1]
        if any(cell.strip() for cell in row):
            lines.append(' | '.join(row) + ' |')
    return lines


# ---------- HWPX ----------
def _local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def _hwpx_cell_text(tc) -> str:
    return ' '.join(t.text.strip() for t in tc.iter() if _local(t.tag) == 't' and t.text and t.text.strip())


def _hwpx_table(tbl) -> list[str]:
    cells = []
    for tr in tbl:
        if _local(tr.tag) != 'tr':
            continue
        for tc in tr:
            if _local(tc.tag) != 'tc':
                continue
            addr = next((e for e in tc if _local(e.tag) == 'cellAddr'), None)
            span = next((e for e in tc if _local(e.tag) == 'cellSpan'), None)
            if addr is None:
                continue
            cells.append({'row': int(addr.get('rowAddr', 0)), 'col': int(addr.get('colAddr', 0)),
                          'rowspan': int(span.get('rowSpan', 1)) if span is not None else 1,
                          'colspan': int(span.get('colSpan', 1)) if span is not None else 1,
                          'text': _hwpx_cell_text(tc)})
    return render_grid(cells)


def _hwpx_render(elem, out: list[str]) -> None:
    tag = _local(elem.tag)
    if tag == 'tbl':
        out.extend(_hwpx_table(elem))
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
                    out.extend(_hwpx_table(child))
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
        _hwpx_render(child, out)


def hwpx_grid_text(data: bytes) -> str:
    out: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if re.match(r'Contents/section\d+\.xml$', n)]
        for name in sorted(names, key=lambda n: int(re.findall(r'\d+', n)[-1])):
            _hwpx_render(ET.fromstring(archive.read(name)), out)
    return '\n'.join(out)


# ---------- HWP 5 ----------
def hwp_grid_text(data: bytes) -> str:
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
                lines = render_grid(tables.pop()['cells'])
                if tables and tables[-1]['cell'] is not None:
                    tables[-1]['cell']['text'] += ' ' + ' / '.join(lines)
                else:
                    out.extend(lines)
            if tag == _CTRL_HEADER and payload[:4][::-1] == b'tbl ':
                pending_level = level
            elif tag == _TABLE and pending_level is not None:
                tables.append({'level': pending_level, 'cells': [], 'cell': None})
                pending_level = None
            elif tag == _LIST_HEADER and tables and level == tables[-1]['level'] + 1 and len(payload) >= 16:
                col, row, colspan, rowspan = struct.unpack_from('<HHHH', payload, 8)
                cell = {'row': row, 'col': col, 'rowspan': rowspan, 'colspan': colspan, 'text': ''}
                tables[-1]['cells'].append(cell)
                tables[-1]['cell'] = cell
            elif tag == _PARA_TEXT:
                text = _para_text(payload)
                if tables and tables[-1]['cell'] is not None:
                    cell = tables[-1]['cell']
                    cell['text'] += (' ' if cell['text'] else '') + text.replace('\n', ' ')
                elif text.strip():
                    out.append(text)
        while tables:
            out.extend(render_grid(tables.pop()['cells']))
    return '\n'.join(out)


def grid_text(data: bytes) -> tuple[str, str]:
    kind = file_format(data)
    if kind == 'hwpx':
        return kind, hwpx_grid_text(data)
    if kind == 'hwp':
        return kind, hwp_grid_text(data)
    if kind == 'pdf':
        return kind, pdf_text(data)
    return kind, ''
