"""Load grade-1 after-school/맞춤형 courses (E05) into SQL 30. Dry-run by default.

Reads the compact extractor output (etl/llm_extraction_spec_afterschool.md) and applies, in code,
the rules that came out of review so the extraction never has to be re-run for them:

  * rows grade 1 cannot take ("false") and rows from an earlier school year's table are dropped
  * a "true" with no grade text is a guess and becomes "unknown"
  * 맞춤형 with no grade text is grade 1 (and 2): the programme exists for 초1·2 by policy, so the
    extractor's 'unknown' there was a missing header, not doubt (2026-10-14)
  * --custom-outputs (llm_extraction_spec_custom.md) replaces a school's generic 맞춤형 rows
    ('맞춤형교실') with the per-weekday programme names when the re-extraction found any
  * Saturday and other non-weekday letters are dropped from 요일; malformed times become NULL
  * the timeline and the latest end per weekday use lower-grade sections only (grade text tops out at
    3학년 or below): a '1~6학년' course is open to grade 1 but its later sections are for older pupils,
    and counting them put the median latest end at 16:40 instead of 15:10 (2026-10-14). A school
    with no lower-grade section falls back to its all-grade sections and says so (timeline_basis)
  * tier A (>= 90% of grade-1 rows carry a weekday and an end time) or B (60-90%) get the
    timeline; C is a course list only (times missing, or no grade written). The share is taken per
    kind and the better of 방과후 and 맞춤형 is the school's tier (2026-10-15). A school with no
    course row at all is not published (2026-10-14 decision: parents adjust times in MY).

    python -m etl.load_school_afterschool --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul
    python -m etl.load_school_afterschool --outputs ... --write-fixture   # local card preview
    python -m etl.load_school_afterschool --outputs ... --apply           # after SQL 30 and user confirmation
"""
from __future__ import annotations

import argparse
import json
import re
from collections import OrderedDict
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / 'etl/runtime/school_afterschool_preview.json'
FIXTURE = ROOT / 'src/dev-fixtures/school-afterschool.json'
SOURCE = '학교알리미 15-라 방과후·돌봄 운영계획 2026년 공시'
SOURCE_YEAR = 2026
WEEKDAYS = '월화수목금'
DAY_COLUMNS = ['latest_end_mon', 'latest_end_tue', 'latest_end_wed', 'latest_end_thu', 'latest_end_fri']
HHMM = re.compile(r'^\d{2}:\d{2}$')
PRIOR_YEAR = re.compile(r'20(1\d|2[0-5])')
COLUMNS_V1 = ['kind', 'name', 'variant', 'section', 'grades_raw', 'days', 'start', 'end', 'grade1', 'line']
COLUMNS_V2 = ['kind', 'name', 'variant', 'section', 'grades_raw', 'days', 'start', 'end', 'grade1', 'term', 'line']
# a section counts as lower-grade when its grade text tops out at this grade
LOWER_GRADE_MAX = 3
# Set to True only after the user has confirmed the reviewed set; --apply refuses otherwise.
CONFIRMED = True   # 2026-10-15: user approved publishing all 536 Seoul schools before the 30-school review

# Category rules (team classification table): the course name is kept as written, only a label is added.
CATEGORIES = [
    ('영어', r'영어|English|잉글리|원어민|리딩|Reading|파닉스|Phonics|ABC'),
    ('수학', r'수학|주산|암산|연산|셈|수리|숫자|수놀이'),
    ('STEM', r'과학|로봇|코딩|컴퓨터|컴기초|컴박사|엑셀|AI|인공지능|드론|3D|메이커|생명|실험|SW|소프트웨어|ITQ|OA|레고|그래비트랙스'),
    ('체육', r'축구|농구|줄넘기|체육|요가|탁구|배드민턴|태권|피구|티볼|스포츠|댄스|K-POP|발레|골프|테니스|플로어볼|체조|키성장|치어|신체|에듀건|사격|힙합'),
    ('음악', r'바이올린|첼로|클라리넷|피아노|오카리나|우쿨렐레|음악|보컬|성악|동요|노래|합창|드럼|난타|플루트|칼림바|리코더|악기'),
    ('미술·창작', r'미술|공예|클레이|종이접기|그림|소묘|수채|파스텔|만들기|공작|블록|웹툰|만화|애니|디자인|미니어처|캘리|도자|POP|펜'),
    ('국어·독서', r'독서|논술|한자|글짓기|책|국어|토론|스피치|역사|한국사|연극'),
    ('사고력', r'바둑|체스|보드게임|큐브|퍼즐|사고력|두뇌|마술|창의'),
    ('요리', r'요리|쿠킹|베이킹|쉐프|셰프|조리'),
]


AUDIT2 = ROOT / 'docs/research/audit2'
TEXT = ROOT / 'etl/runtime/audit2-documents/text'
# A 방과후 section with no grade text inherits the plan's own 방과후 target when the plan states one:
# the Seoul template '초1~6학년 대상의 방과후교실', '방과후교실: 1~6학년 중 희망 학생', or '대상: 1~6학년 희망 학생'
# right under a 방과후 heading. It stays grade1 'unknown' (a course can still restrict grades) and only
# says so in grades_raw, so the timeline and counts do not change (2026-10-15: 98 of 136 schools).
SCHOOL_WIDE = '학교 안내 1~6학년'
_G16 = r'1\s*[~∼\-–]\s*6\s*학년'
SCHOOL_WIDE_PATTERNS = [
    re.compile(rf'(?:초\s*)?{_G16}\s*대상의\s*방과\s*후'),
    re.compile(rf'방과\s*후\s*(?:학교|교실|프로그램)?\s*[:：(]\s*(?:초\s*)?{_G16}'),
    re.compile(rf'방과\s*후\s*(?:학교|교실|프로그램)?\s*[:：]?\s*(?:초\s*)?{_G16}\s*(?:학생\s*)?중?\s*희망'),
]
SCHOOL_WIDE_SECTION = re.compile(rf'대\s*상\s*[:：]\s*(?:초\s*)?{_G16}\s*(?:학생\s*)?(?:중\s*)?희망')
_plan_files: dict[str, list[dict]] | None = None


def school_wide_target(school_id: str) -> bool:
    """True when the school's 15-라 plan says its 방과후 classes are for grades 1-6 (local source text only)."""
    global _plan_files
    if _plan_files is None:
        _plan_files = {}
        for path in sorted(AUDIT2.glob('schoolinfo_care_plan_audit_*.json')):
            for school in json.loads(path.read_text(encoding='utf-8'))['schools']:
                _plan_files.setdefault(school['school_id'], school.get('files', []))
    for f in _plan_files.get(school_id, []):
        path = TEXT / f"{f.get('sha256')}.txt"
        if not f.get('sha256') or not path.exists():
            continue
        lines = path.read_text(encoding='utf-8').splitlines()
        for index, line in enumerate(lines):
            if any(p.search(line) for p in SCHOOL_WIDE_PATTERNS):
                return True
            if SCHOOL_WIDE_SECTION.search(line) and '돌봄' not in line:
                heads = [h for h in lines[max(0, index - 4):index] if re.search(r'방과\s*후|맞춤형|돌봄', h)]
                if heads and re.search(r'방과\s*후', heads[-1]) and not re.search(r'맞춤형|돌봄', heads[-1]):
                    return True
    return False


def category(name: str) -> str:
    for label, pattern in CATEGORIES:
        if re.search(pattern, name, re.I):
            return label
    return '기타'


def grade_upper(grades_raw: str | None) -> int | None:
    """The highest grade a section's grade text names ('1~6학년' -> 6, '1-2' -> 2), or None."""
    text = str(grades_raw or '')
    if '전학년' in text or '고학년' in text:
        return 6
    numbers = [int(n) for n in re.findall(r'(?<!\d)([1-6])(?!\d)', text)]
    if numbers:
        return max(numbers)
    return LOWER_GRADE_MAX if '저학년' in text else None


def clean_row(values: list) -> dict[str, Any] | None:
    """One extractor row after the review rules, or None when it is not a grade-1 offer this year."""
    row = dict(zip(COLUMNS_V2 if len(values) == 11 else COLUMNS_V1, values))
    if row.get('grade1') == 'false' or PRIOR_YEAR.search(str(row.get('term') or '')):
        return None
    if row.get('kind') == '맞춤형' and not row.get('grades_raw') and row.get('grade1') in ('true', 'unknown'):
        row['grade1'] = 'true'
    elif row.get('grade1') == 'true' and not row.get('grades_raw'):
        row['grade1'] = 'unknown'
    if row.get('grade1') not in ('true', 'unknown') or row.get('kind') not in ('방과후', '맞춤형') or not row.get('name'):
        return None
    days = ''.join(d for d in str(row.get('days') or '') if d in WEEKDAYS)
    row['days'] = ''.join(sorted(set(days), key=WEEKDAYS.index)) or None
    for key in ('start', 'end'):
        row[key] = row[key] if HHMM.match(str(row.get(key) or '')) else None
    if row['start'] and row['end'] and row['start'] >= row['end']:
        row['start'] = row['end'] = None
    # '월~금(주1회)' names the range a class may fall on, not five meetings: without a time it says no day
    if row['days'] == WEEKDAYS and not row['start'] and not row['end']:
        row['days'] = None
    row['grade_upper'] = grade_upper(row.get('grades_raw'))
    if row['kind'] == '맞춤형' and row['grade_upper'] is None:
        row['grade_upper'] = 2
    return row


def custom_rows(school: dict) -> list[list]:
    """Re-extracted 맞춤형 rows ([name, day, start, end, grades_raw, line]) in the compact v2 shape."""
    return [['맞춤형', name, None, None, grades, day, start, end, 'true', None, line]
            for name, day, start, end, grades, line in school.get('rows', [])]


def school_record(school: dict) -> dict[str, Any] | None:
    rows = [r for r in (clean_row(v) for v in school.get('rows', [])) if r]
    if not rows:
        return None
    # tier per kind, the better one wins: a 방과후 list without times must not hide timed 맞춤형 bars
    # (전농: 맞춤형 5/5 timed, 방과후 0/27 -> 16% overall was C, 2026-10-15). Untimed sections draw no bar anyway
    tiers = []
    for kind in ('방과후', '맞춤형'):
        grade1 = [r for r in rows if r['grade1'] == 'true' and r['kind'] == kind]
        if grade1:
            share = sum(1 for r in grade1 if r['days'] and r['end']) / len(grade1)
            tiers.append('A' if share >= 0.9 else 'B' if share >= 0.6 else 'C')
    tier = min(tiers) if tiers else 'C'
    ungraded = [r for r in rows if r['kind'] == '방과후' and r['grade1'] == 'unknown' and not r.get('grades_raw')]
    if ungraded and school_wide_target(school['school_id']):
        for r in ungraded:
            r['grades_raw'] = SCHOOL_WIDE
    options: OrderedDict[tuple, dict] = OrderedDict()
    for r in rows:
        key = (r['kind'], r['name'], r.get('variant'))
        option = options.setdefault(key, {'kind': r['kind'], 'name': r['name'], 'variant': r.get('variant'),
                                          'category': category(f"{r['name']} {r.get('variant') or ''}"), 'grade1': 'unknown', 'sections': []})
        if r['grade1'] == 'true':
            option['grade1'] = 'true'
        option['sections'].append({'section': r.get('section'), 'grades_raw': r.get('grades_raw'), 'grade1': r['grade1'],
                                   'grade_upper': r['grade_upper'], 'days': r['days'], 'start': r['start'], 'end': r['end'],
                                   'term': r.get('term')})
    # the same rule as the card's bars: grade-1 sections of 방과후, lower-grade ones when the school has any
    timed = [s for o in options.values() if o['kind'] == '방과후' for s in o['sections']
             if s['grade1'] == 'true' and s['days'] and s['end']]
    lower = [s for s in timed if s['grade_upper'] is not None and s['grade_upper'] <= LOWER_GRADE_MAX]
    basis = 'lower' if lower else 'all' if timed else None
    latest = {d: None for d in WEEKDAYS}
    for s in lower or timed:
        for d in s['days']:
            if latest[d] is None or s['end'] > latest[d]:
                latest[d] = s['end']
    values = list(options.values())
    terms = sorted({s['term'] for o in values for s in o['sections'] if s['term']})
    return {'school_id': school['school_id'], 'tier': tier, 'options': values, 'latest': latest, 'timeline_basis': basis,
            'grade1_options': sum(o['grade1'] == 'true' for o in values),
            'custom_options': sum(o['kind'] == '맞춤형' for o in values),
            'unknown_grade_options': sum(o['grade1'] != 'true' for o in values),
            'term_label': ', '.join(terms[:3]) or None, 'note': school.get('note')}


def build(outputs: list[Path], custom: list[Path] | None = None,
          afterschool: list[Path] | None = None) -> tuple[list[dict], dict[str, int]]:
    # a later --outputs directory (e.g. a re-extraction) replaces the same school from an earlier one
    latest: dict[str, dict] = {}
    for directory in outputs:
        for path in sorted(directory.glob('batch_*.json')):
            for school in json.loads(path.read_text(encoding='utf-8')):
                latest[school['school_id']] = school
    # --afterschool-outputs (a wide re-run for schools with no 방과후 row) replaces 방과후 rows only: its
    # 맞춤형 rows were re-read worse than the first pass for 잠신 and others (2026-10-15)
    for directory in afterschool or []:
        for path in sorted(directory.glob('batch_*.json')):
            for school in json.loads(path.read_text(encoding='utf-8')):
                if school['school_id'] not in latest:
                    latest[school['school_id']] = school
                    continue
                base = latest[school['school_id']]
                kept = [r for r in base.get('rows', []) if r[0] != '방과후']
                latest[school['school_id']] = {**base, 'rows': kept + [r for r in school.get('rows', []) if r[0] == '방과후']}
    for directory in custom or []:
        for path in sorted(directory.glob('batch_*.json')):
            for school in json.loads(path.read_text(encoding='utf-8')):
                if school['school_id'] in latest and school.get('rows'):
                    base = latest[school['school_id']]
                    kept = [r for r in base.get('rows', []) if r[0] != '맞춤형']
                    latest[school['school_id']] = {**base, 'rows': kept + custom_rows(school)}
    records, counts = [], {'schools': 0, 'published': 0, 'A': 0, 'B': 0, 'C': 0, 'not_published': 0}
    for school in latest.values():
        counts['schools'] += 1
        record = school_record(school)
        if record is None:
            counts['not_published'] += 1
            continue
        counts['published'] += 1
        counts[record['tier']] += 1
        records.append(record)
    return records, counts


def table_rows(records: list[dict], snapshot: str) -> dict[str, list[dict]]:
    summary, programs = [], []
    for r in records:
        summary.append({'school_id': r['school_id'], 'source_year': SOURCE_YEAR, 'tier': r['tier'],
                        'grade1_options': r['grade1_options'], 'custom_options': r['custom_options'],
                        'unknown_grade_options': r['unknown_grade_options'],
                        **{column: r['latest'][d] for column, d in zip(DAY_COLUMNS, WEEKDAYS)}, 'timeline_basis': r['timeline_basis'],
                        'term_label': r['term_label'], 'source': SOURCE, 'review_state': 'auto', 'snapshot_date': snapshot})
        seq = 0
        for option in r['options']:
            for s in option['sections']:
                seq += 1
                programs.append({'school_id': r['school_id'], 'seq': seq, 'kind': option['kind'], 'name': option['name'],
                                 'variant': option['variant'], 'section': s['section'], 'category': option['category'],
                                 'grade1': s['grade1'], 'grades_raw': s['grades_raw'], 'grade_upper': s['grade_upper'], 'weekdays': s['days'],
                                 'start_time': s['start'], 'end_time': s['end'], 'term': s['term']})
    return {'school_afterschool_summary': summary, 'school_afterschool_programs': programs}


def fixture(records: list[dict]) -> dict[str, dict]:
    """The frontend's SchoolAfterschool shape, for the dev server."""
    return {r['school_id']: {'school_id': r['school_id'], 'source_year': SOURCE_YEAR, 'tier': r['tier'], 'term': r['term_label'], 'note': r['note'],
                             'options': [{**{k: o[k] for k in ('kind', 'name', 'variant', 'category', 'grade1')},
                                          'sections': [{**{k: s[k] for k in ('section', 'grade1', 'grade_upper', 'days', 'start', 'end')},
                                                        'school_wide': s['grades_raw'] == SCHOOL_WIDE} for s in o['sections']]}
                                         for o in r['options']]} for r in records}


def assert_no_school_loss(summary_rows: list[dict], existing_ids: set[str]) -> None:
    """Refuse a whole-snapshot apply when any existing school is absent from inputs."""
    incoming = {row['school_id'] for row in summary_rows}
    missing = existing_ids - incoming
    if missing:
        raise ValueError(f'Apply aborted before writes: {len(missing)} existing schools are absent from inputs. '
                         'Include every reviewed output, including seoul_gap37_reviewed. No schools removed.')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--outputs', action='append', required=True, type=Path)
    parser.add_argument('--custom-outputs', action='append', type=Path, help='맞춤형 re-extraction (llm_extraction_spec_custom.md)')
    parser.add_argument('--afterschool-outputs', action='append', type=Path, help='방과후-only re-extraction (wide inputs); keeps 맞춤형 rows')
    parser.add_argument('--write-fixture', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    snapshot = date.today().isoformat()
    records, counts = build(args.outputs, args.custom_outputs, args.afterschool_outputs)
    rows = table_rows(records, snapshot)
    report = {'mode': 'apply' if args.apply else 'dry-run', 'snapshot_date': snapshot, **counts,
              'rows': {table: len(items) for table, items in rows.items()}, 'confirmed': CONFIRMED}
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
    if args.write_fixture:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(fixture(records), ensure_ascii=False), encoding='utf-8')
    if args.apply and not CONFIRMED:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit('the extracted set is not user-confirmed; nothing uploaded')
    if args.apply:
        from etl.collect_care_data import credentials, rest
        url, service_key, _ = credentials()
        # Partial input must never erase schools that an earlier reviewed release added.
        # Check every page before the first write; one short API page is not a full baseline.
        existing_ids: set[str] = set()
        offset = 0
        while True:
            page = rest(url, service_key, f'school_afterschool_summary?select=school_id&order=school_id&limit=500&offset={offset}')
            existing_ids.update(row['school_id'] for row in page)
            if len(page) < 500:
                break
            offset += 500
        assert_no_school_loss(rows['school_afterschool_summary'], existing_ids)
        for table, conflict in (('school_afterschool_summary', 'school_id'), ('school_afterschool_programs', 'school_id,seq')):
            items = rows[table]
            for start in range(0, len(items), 500):
                rest(url, service_key, f'{table}?on_conflict={conflict}', method='POST', data=items[start:start + 500],
                     headers={'Prefer': 'resolution=merge-duplicates,return=minimal'})
        # an older snapshot's school drops with its programs (cascade); stale sections of a kept school go too
        rest(url, service_key, f'school_afterschool_summary?snapshot_date=lt.{snapshot}', method='DELETE', headers={'Prefer': 'return=minimal'})
        for r in rows['school_afterschool_summary']:
            last = max(p['seq'] for p in rows['school_afterschool_programs'] if p['school_id'] == r['school_id'])
            rest(url, service_key, f"school_afterschool_programs?school_id=eq.{r['school_id']}&seq=gt.{last}", method='DELETE',
                 headers={'Prefer': 'return=minimal'})
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
