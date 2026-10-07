"""Does each PoC school's 학교알리미 2-가 curriculum disclosure contain a daily clock (시정표)?

Reads docs/research/audit2/schoolinfo_disclosure_probe_<date>.json, downloads the listed
non-calendar attachments with the public GET the disclosure page itself uses, keeps the bytes
under etl/runtime/audit2-documents/ (git-ignored), extracts text locally and detects period
clock rows and grade-1 weekday period counts deterministically. Nothing is uploaded or
published; detected values are candidates for review, not confirmed schedules.

    python -m etl.audit_schoolinfo_daily_clock [--probe PATH] [--out PATH]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from etl.school_document_text import extract_text

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'etl' / 'runtime' / 'audit2-documents'
TEXT_DIR = ARCHIVE / 'text'
DOWNLOAD = 'https://www.schoolinfo.go.kr/servlets/EiFileDownLoad.do'

_T = r'(\d{1,2})\s*:\s*(\d{2})'
# PDF text may also run start and end together ("08:4009:00") or leave only a space.
TIME_RANGE = re.compile(_T + r'\s*(?:[~∼\-–]|\|)?\s*' + _T)
CLOCK_HEADING = re.compile(r'시\s*정\s*표|일\s*과\s*표|일과\s*운영\s*계획|1일\s*시간\s*운영|하루\s*일과')
SLOT_LABEL = re.compile(r'([1-7])\s*교\s*시|([1-4])\s*블\s*[록럭]|점\s*심|중간\s*놀이|쉬는\s*시간|아침|놀이\s*시간|해피\s*타임|등\s*교|(?<![가-힣])교\s*시|(?<!우유)(?<!우유\s)급\s*식|중\s*식')
WEEKDAY_PERIODS = re.compile(r'^\s*1\s*(?:학\s*년)?\s*\|' + r'\s*([4-6])\s*(?:교시)?\s*\|' * 5)


def clock_rows(text: str) -> list[dict]:
    """Rows that pair a slot label with a time range on the same line."""
    rows = []
    for number, line in enumerate(text.splitlines(), 1):
        # PDF text often runs several slots together on one line, so take every range and
        # label each with the nearest slot name since the previous range.
        previous_end = 0
        for span in TIME_RANGE.finditer(line):
            before = line[previous_end:span.start()][-60:]
            previous_end = span.end()
            labels = list(SLOT_LABEL.finditer(before))
            # label after the time ("09:00∼9:40 (40) | 1교시") when nothing precedes it
            label = labels[-1] if labels else SLOT_LABEL.search(line[span.end():][:25])
            if not label:
                continue
            start = f'{int(span.group(1)):02d}:{span.group(2)}'
            end = f'{int(span.group(3)):02d}:{span.group(4)}'
            if not ('07:00' <= start < end <= '17:00'):
                continue
            name = re.sub(r'\s+', '', label.group(0))
            rows.append({'line': number, 'label': '점심' if name in ('급식', '중식') else name, 'start': start, 'end': end})
    return rows


def clock_blocks(rows: list[dict], gap: int = 12) -> list[list[dict]]:
    """Clusters of nearby rows that look like a whole day: a first period and lunch."""
    clusters, current = [], []
    for row in rows:
        if current and row['line'] - current[-1]['line'] > gap:
            clusters.append(current)
            current = []
        current.append(row)
    if current:
        clusters.append(current)
    whole_day = []
    for cluster in clusters:
        labels = {r['label'] for r in cluster}
        starts_morning = min(r['start'] for r in cluster) <= '09:30'
        if starts_morning and '점심' in labels and len(cluster) >= 4:
            whole_day.append(cluster)
    return whole_day


FIVE_PERIODS = re.compile(r'^\s*' + r'([4-6])\s*(?:교시)?\s*\|\s*' * 5)


def grade1_weekday_periods(text: str) -> list[list[int]]:
    found = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = WEEKDAY_PERIODS.match(line)
        if match:
            found.append([int(v) for v in match.groups()])
        elif index and re.match(r'^\s*1\s*학\s*년\s*\|', lines[index - 1]):
            # merged cell: "1학년 | 4교시 | 3월 |" then the weekday row without its label
            follow = FIVE_PERIODS.match(line)
            if follow:
                found.append([int(v) for v in follow.groups()])
    return found


SOURCE_INDEX = ARCHIVE / 'schoolinfo_source_index.json'
REUSE_TEXT = True


# Download-form codes per disclosure item, as the item page's own eiFileDownForm sends them.
ITEM_CODES = {
    'curriculum': {'JG_BURYU_CD': 'JG020', 'JG_HANGMOK_CD': '05', 'JG_GUBUN': '1', 'JG_CHASU': '1'},   # 2-가
    'afterschool': {'JG_BURYU_CD': 'JG150', 'JG_HANGMOK_CD': '59', 'JG_GUBUN': '1', 'JG_CHASU': '2'},  # 15-라
}


def _key(school: dict, attachment: dict, item: str, year: str = '2026') -> str:
    base = f"{school['shl_idf_cd']}/{year}/{attachment['file_seq']}"
    return base if item == 'curriculum' else f'{item}/{base}'  # curriculum keys predate the prefix


def _cached(school: dict, attachment: dict, item: str = 'curriculum', year: str = '2026') -> bytes | None:
    """Reuse bytes already archived for this disclosure file; the hash is re-checked."""
    if not SOURCE_INDEX.exists():
        return None
    digest = json.loads(SOURCE_INDEX.read_text(encoding='utf-8')).get(_key(school, attachment, item, year))
    for path in ARCHIVE.glob(f'{digest}.*') if digest else []:
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() == digest:
            return data
    return None


def _remember(school: dict, attachment: dict, digest: str, item: str = 'curriculum', year: str = '2026') -> None:
    index = json.loads(SOURCE_INDEX.read_text(encoding='utf-8')) if SOURCE_INDEX.exists() else {}
    index[_key(school, attachment, item, year)] = digest
    SOURCE_INDEX.write_text(json.dumps(index, indent=1), encoding='utf-8')


def _download(school: dict, attachment: dict, item: str = 'curriculum', year: str = '2026') -> bytes:
    query = urllib.parse.urlencode({'SHL_IDF_CD': school['shl_idf_cd'], **ITEM_CODES[item], 'JG_YEAR': year, 'USE_YN': 'Y',
                                    'FILE_SEQ': attachment['file_seq']})
    with urllib.request.urlopen(f'{DOWNLOAD}?{query}', timeout=120) as response:
        return response.read()


def fetch_text(school: dict, attachment: dict, item: str, year: str = '2026') -> dict:
    """Archived (or freshly downloaded) bytes for one disclosure attachment, plus extracted text."""
    data = _cached(school, attachment, item, year)
    source = 'archive' if data else 'download'
    if data is None:
        data = _download(school, attachment, item, year)
        time.sleep(1)
    digest = hashlib.sha256(data).hexdigest()
    text_path = TEXT_DIR / f'{digest}.txt'
    from etl.school_document_text import file_format
    kind = file_format(data)
    if REUSE_TEXT and text_path.exists():
        text = text_path.read_text(encoding='utf-8')
    else:
        kind, text = extract_text(data)
        TEXT_DIR.mkdir(parents=True, exist_ok=True)
        text_path.write_text(text, encoding='utf-8')
    (ARCHIVE / f'{digest}.{kind if kind != "unknown" else "bin"}').write_bytes(data)
    _remember(school, attachment, digest, item, year)
    return {'sha256': digest, 'format': kind, 'bytes': len(data), 'bytes_source': source, 'text': text}


def audit_school(school: dict) -> dict:
    record = {'school_id': school['school_id'], 'school_name': school['school_name'], 'region': school['region'], 'files': []}
    for attachment in school['items']['curriculum'].get('attachments', []):
        if attachment.get('kind') == 'academic_calendar':
            continue
        entry = {'name': attachment['name']}
        try:
            data = _cached(school, attachment)
            entry['bytes_source'] = 'archive' if data else 'download'
            if data is None:
                data = _download(school, attachment)
                time.sleep(1)
            digest = hashlib.sha256(data).hexdigest()
            text_path = TEXT_DIR / f'{digest}.txt'
            if REUSE_TEXT and text_path.exists():  # PDF extraction of a 300-page plan takes minutes
                from etl.school_document_text import file_format
                kind, text = file_format(data), text_path.read_text(encoding='utf-8')
            else:
                kind, text = extract_text(data)
            (ARCHIVE / f'{digest}.{kind if kind != "unknown" else "bin"}').write_bytes(data)
            _remember(school, attachment, digest)
            TEXT_DIR.mkdir(parents=True, exist_ok=True)
            (TEXT_DIR / f'{digest}.txt').write_text(text, encoding='utf-8')
            blocks = clock_blocks(clock_rows(text))
            entry.update({'sha256': digest, 'format': kind, 'bytes': len(data), 'text_chars': len(text),
                          'clock_blocks': [[{k: r[k] for k in ('label', 'start', 'end')} for r in b] for b in blocks[:3]],
                          'clock_block_count': len(blocks), 'clock_first_line': blocks[0][0]['line'] if blocks else None,
                          'grade1_weekday_periods': grade1_weekday_periods(text)[:3]})
            heading = CLOCK_HEADING.search(text)
            entry['clock_heading'] = text[heading.start():heading.start() + 40].replace('\n', ' ') if heading else None
            # a heading with no parsable times usually means the table is an image
            entry['status'] = ('unreadable' if len(text.strip()) < 200 else 'clock_found' if blocks
                               else 'clock_heading_only' if heading else 'no_clock_detected')
        except Exception as error:  # record and continue with the next file
            entry.update({'status': 'failed', 'error': type(error).__name__})
        record['files'].append(entry)
    statuses = [f['status'] for f in record['files']]
    record['status'] = ('no_attachment' if not statuses else 'clock_found' if 'clock_found' in statuses
                        else 'clock_heading_only' if 'clock_heading_only' in statuses
                        else 'unreadable' if all(s in ('unreadable', 'failed') for s in statuses) else 'no_clock_detected')
    return record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', default=str(ROOT / 'docs/research/audit2/schoolinfo_disclosure_probe_20261006.json'))
    parser.add_argument('--out', default=str(ROOT / 'docs/research/audit2/schoolinfo_daily_clock_audit_20261006.json'))
    parser.add_argument('--fresh-text', action='store_true', help='re-extract text even when a cached copy exists')
    args = parser.parse_args()
    global REUSE_TEXT
    REUSE_TEXT = not args.fresh_text
    probe = json.loads(Path(args.probe).read_text(encoding='utf-8'))
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    schools = [audit_school(s) for s in probe['schools']]
    summary: dict[str, int] = {}
    for s in schools:
        summary[s['status']] = summary.get(s['status'], 0) + 1
    result = {'schema_version': 'schoolinfo-daily-clock-audit-v1', 'checked_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'source': '학교알리미 2-가 2026년 4월 공시 첨부 (연간학사일정 파일 제외)', 'method': 'local HWP/HWPX/PDF text extraction + regex; candidates, not reviewed values',
              'no_operational_upload': True, 'school_count': len(schools), 'summary': summary, 'schools': schools}
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
