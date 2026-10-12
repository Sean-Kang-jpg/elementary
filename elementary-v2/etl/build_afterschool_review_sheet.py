"""Review sheets for the compact after-school extraction (llm_extraction_spec_afterschool.md).

The extractor cites only a line number. This joins each row back to that line of its input file
(and the attachment it came from), checks that the cited line or its neighbours hold the row's
times and grade, and writes two CSVs (UTF-8 with BOM, opens in Excel):

  afterschool_review_rows_<set>.csv     one row per course/section, with a blank 검토 column
  afterschool_review_schools_<set>.csv  per school: options, grade-1 options, latest end per weekday

    python -m etl.build_afterschool_review_sheet --set seoul30
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
INPUTS = ROOT / 'etl/runtime/llm_extraction/inputs_afterschool'
OUTPUTS = ROOT / 'etl/runtime/llm_extraction/outputs_afterschool'
AUDIT2 = ROOT / 'docs/research/audit2'
WEEKDAYS = '월화수목금'
COLUMNS = ['kind', 'name', 'variant', 'section', 'grades_raw', 'days', 'start', 'end', 'grade1', 'line']
# spec v2 (2026-10-12): every row is kept, with false for rows grade 1 cannot take, and the table's term
COLUMNS_V2 = ['kind', 'name', 'variant', 'section', 'grades_raw', 'days', 'start', 'end', 'grade1', 'term', 'line']
ITEM_PAGE = 'https://www.schoolinfo.go.kr/ei/pp/Pneipp_b73_s0p.do'


def probe_index() -> dict[str, dict]:
    index = {}
    for path in sorted(AUDIT2.glob('schoolinfo_disclosure_probe*.json')):
        for school in json.loads(path.read_text(encoding='utf-8'))['schools']:
            index.setdefault(school['school_id'], school)
    return index


def item_link(school: dict) -> str:
    if not school.get('shl_idf_cd'):
        return ''
    query = {'GS_HANGMOK_CD': '73', 'GS_HANGMOK_NO': '15-라', 'GS_HANGMOK_NM': '방과후학교 운영 계획 및 운영ㆍ지원현황', 'GS_BURYU_CD': 'JG130',
             'JG_BURYU_CD': 'JG150', 'JG_HANGMOK_CD': '59', 'JG_GUBUN': '1', 'JG_YEAR2': '2026', 'HG_NM': school['school_name'],
             'SHL_IDF_CD': school['shl_idf_cd'], 'GS_TYPE': 'Y', 'JG_YEAR': '2026', 'SORT': 'BR', 'CHOSEN_JG_YEAR': '2026',
             'PRE_JG_YEAR': '2026', 'LOAD_TYPE': 'single'}
    return f'{ITEM_PAGE}?{urlencode(query)}'


PHONE = re.compile(r'(?:[가-힣]{2,4}\s*)?0\d{1,2}\s*[-.)]\s*\d{3,4}\s*[-.]\s*\d{4}')


def redact(text: str) -> str:
    """Instructor lists often sit beside the course table: drop phone numbers and the name before them."""
    return PHONE.sub('[연락처 삭제]', text)


def read_input(school_id: str) -> tuple[str, dict[int, str], dict[int, str]]:
    """(school name, line number -> text, line number -> attachment name)."""
    lines, files, current = {}, {}, ''
    text = (INPUTS / f'{school_id}.txt').read_text(encoding='utf-8').splitlines()
    for raw in text:
        match = re.match(r'L(\d+): (.*)', raw)
        if not match:
            continue
        number, body = int(match.group(1)), match.group(2)
        if body.startswith('[file: '):
            current = body[7:].rstrip(']')
        lines[number], files[number] = body, current
    return text[1].split(': ', 1)[1], lines, files


def check(row: dict, lines: dict[int, str]) -> str:
    """Empty when the cited line (or the two around it) carries the row's times and grade text."""
    line = row.get('line')
    if not isinstance(line, int) or line not in lines:
        return '줄번호 없음'
    near = ' '.join(lines.get(n, '') for n in range(line - 2, line + 3))
    squashed = re.sub(r'\s+', '', near)
    problems = []
    for key in ('start', 'end'):
        value = row.get(key)
        if value:
            hours, mins = value.split(':')
            if not re.search(rf'(?<!\d)0?({int(hours)}|{int(hours) - 12}):{mins}', squashed):
                problems.append(f'{key} 시각이 근처 줄에 없음')
    if row.get('grades_raw') and re.sub(r'\s+', '', row['grades_raw']) not in squashed:
        problems.append('학년 표기가 근처 줄에 없음')
    return '; '.join(problems)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--set', required=True)
    args = parser.parse_args()
    probes = probe_index()
    row_out, school_out = [], []
    for path in sorted((OUTPUTS / args.set).glob('batch_*.json')):
        for school in json.loads(path.read_text(encoding='utf-8')):
            school_id = school['school_id']
            name, lines, files = read_input(school_id)
            link = item_link(probes.get(school_id, {}))
            options, grade1_options, latest = set(), set(), defaultdict(str)
            flagged = 0
            for values in school.get('rows', []):
                row = dict(zip(COLUMNS_V2 if len(values) == 11 else COLUMNS, values))
                if row.get('grade1') == 'false':
                    continue
                option = (row['kind'], row['name'], row.get('variant'))
                options.add(option)
                if row.get('grade1') == 'true':
                    grade1_options.add(option)
                    for day in row.get('days') or '':
                        if day in WEEKDAYS and row.get('end'):
                            latest[day] = max(latest[day], row['end'])
                problem = check(row, lines)
                flagged += bool(problem)
                row_out.append({'school_id': school_id, '학교': name, '종류': row['kind'], '강좌명': row['name'], '과정': row.get('variant') or '',
                                '반': row.get('section') or '', '대상학년(원문)': row.get('grades_raw') or '', '요일': row.get('days') or '',
                                '시작': row.get('start') or '', '종료': row.get('end') or '', '1학년': row.get('grade1'),
                                '줄': row.get('line'), '원문 줄': redact(lines.get(row.get('line'), '')), '첨부': files.get(row.get('line'), ''),
                                '자동점검': problem, '검토(O/X)': '', '검토 메모': ''})
            school_out.append({'school_id': school_id, '학교': name, '선택지(종목)': len(options), '1학년 가능': len(grade1_options),
                               '학년 확인 필요': len(options - grade1_options),
                               **{f'{day} 최종 종료': latest.get(day, '') for day in WEEKDAYS},
                               '기간': school.get('term') or '', '자동점검 걸린 행': flagged, '추출 메모': school.get('note') or '',
                               '학교알리미 15-라': link, '검토(O/X)': '', '검토 메모': ''})
    for rows, label in ((row_out, 'rows'), (school_out, 'schools')):
        out = AUDIT2 / f'afterschool_review_{label}_{args.set}.csv'
        with out.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    print(json.dumps({'schools': len(school_out), 'rows': len(row_out), 'flagged_rows': sum(bool(r['자동점검']) for r in row_out)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
