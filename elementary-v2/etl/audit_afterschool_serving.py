"""QA for the live after-school serving (SQL 30): flag schools whose card may look wrong.

Reads the public tables with the anon key, the way the browser does, and joins the grade-1 day
estimates (SQL 26) and the Seoul school list. Each check names its likely cause:

  coverage  the school was never extracted or loaded
  source    the disclosure itself lacks the value (no grade, no time) - nothing to fix in code
  extract   the extractor read the document wrongly or kept rows it should have dropped
  rule      the loader's rules produced a misleading value (fixable in code, no re-extraction)
  info      intended behaviour worth counting, not a defect

    python -m etl.audit_afterschool_serving            # summary
    python -m etl.audit_afterschool_serving --csv out  # also one row per flagged school
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEEKDAYS = '월화수목금'


def env() -> tuple[str, str]:
    values = dict(os.environ)
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                values.setdefault(key.strip(), value.strip().strip('"'))
    return values['VITE_SUPABASE_URL'], values['VITE_SUPABASE_ANON_KEY']


def fetch(url: str, key: str, table: str, select: str, filters: str = '') -> list[dict]:
    rows, start = [], 0
    while True:
        request = urllib.request.Request(f'{url}/rest/v1/{table}?select={urllib.parse.quote(select)}{filters}',
                                         headers={'apikey': key, 'Authorization': f'Bearer {key}',
                                                  'Range': f'{start}-{start + 999}'})
        with urllib.request.urlopen(request, timeout=60) as response:
            page = json.loads(response.read())
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def minutes(value: str | None) -> int | None:
    if not value:
        return None
    hours, mins = value[:5].split(':')
    return int(hours) * 60 + int(mins)


CHECKS = {
    # code: (cause, description)
    'not_extracted': ('coverage', '서울 학교인데 방과후 추출을 하지 않았다'),
    'no_course_table': ('source', '추출했지만 강좌표가 없어 공개하지 않았다'),
    'no_dismissal': ('coverage', '1학년 하교 예상(SQL 26)이 없어 수업 막대가 없다'),
    'paid_no_grade': ('source', '방과후 반에 대상 학년이 하나도 적혀 있지 않다(학교 전체 안내도 없음)'),
    # school_wide_target() in the loader (e25587c): the plan says '초1~6학년 대상의 방과후교실' once for
    # the whole list; grades_raw carries it but grade1 stays unknown so bars and counts do not move
    'paid_school_wide': ('source', '방과후 반마다의 학년은 없고 학교 전체 대상(1~6학년) 안내만 있다'),
    # intended since e25587c (2026-10-15): the tier is per kind and the better one wins, so timed 맞춤형
    # bars show even when the 방과후 list has no times. Counted for context, not as a defect
    'tier_by_custom_only': ('info', 'A·B 등급이 맞춤형에서 나왔다(방과후 반은 시각 없음, 의도된 규칙)'),
    'morning_rows': ('extract', '정오 전에 끝나는 반(아침·방학 강좌)이 들어 있다'),
    'starts_before_dismissal': ('rule', '1학년 반이 그날 하교 전에 시작한다(4교시 날용 반이거나 학년 오판)'),
    'very_long_or_short': ('extract', '반 하나가 3시간을 넘거나 20분 미만이다'),
    'late_lower_grade': ('extract', '저학년 반이 17시 이후에 끝난다'),
    'generic_custom_name': ('source', '맞춤형이 요일별 프로그램명 없이 총칭으로만 있다'),
    'tier_c': ('source', '강좌 목록만 있다(시각이나 학년이 거의 없음)'),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--csv', type=Path)
    args = parser.parse_args()
    url, key = env()
    summary = {r['school_id']: r for r in fetch(url, key, 'school_afterschool_summary', 'school_id,tier,timeline_basis')}
    programs = defaultdict(list)
    for r in fetch(url, key, 'school_afterschool_programs', 'school_id,kind,name,grade1,grades_raw,grade_upper,weekdays,start_time,end_time'):
        programs[r['school_id']].append(r)
    dismissal = defaultdict(dict)
    for r in fetch(url, key, 'school_day_estimate_weekdays', 'school_id,weekday,dismissal'):
        dismissal[r['school_id']][r['weekday']] = minutes(r['dismissal'])
    seoul = {r['school_id']: r['school_name'] for r in fetch(url, key, 'school_master', 'school_id,school_name',
                                                                     '&region=eq.' + urllib.parse.quote('서울특별시')
                                                                     + '&school_type=eq.' + urllib.parse.quote('초등학교'))}
    extracted = set()
    for path in (ROOT / 'etl/runtime/llm_extraction/outputs_afterschool').glob('seoul*/batch_*.json'):
        extracted |= {s['school_id'] for s in json.loads(path.read_text(encoding='utf-8'))}

    flags: dict[str, list[str]] = defaultdict(list)
    for school_id in seoul:
        if school_id not in extracted:
            flags[school_id].append('not_extracted')
            continue
        if school_id not in summary:
            flags[school_id].append('no_course_table')
            continue
        rows = programs[school_id]
        tier = summary[school_id]['tier']
        if not any(v for v in dismissal.get(school_id, {}).values()):
            flags[school_id].append('no_dismissal')
        paid = [r for r in rows if r['kind'] == '방과후']
        if paid and not any(r['grade1'] == 'true' for r in paid):
            school_wide = any((r['grades_raw'] or '').startswith('학교 안내') for r in paid)
            flags[school_id].append('paid_school_wide' if school_wide else 'paid_no_grade')
        timed_paid = [r for r in paid if r['grade1'] == 'true' and r['weekdays'] and r['end_time']]
        if tier in ('A', 'B') and not timed_paid and paid:
            flags[school_id].append('tier_by_custom_only')
        if tier == 'C':
            flags[school_id].append('tier_c')
        if any((minutes(r['end_time']) or 9999) <= 12 * 60 for r in rows):
            flags[school_id].append('morning_rows')
        early = 0
        for r in timed_paid:
            start = minutes(r['start_time'])
            for day in r['weekdays']:
                end_of_class = dismissal.get(school_id, {}).get(WEEKDAYS.index(day) + 1)
                if start is not None and end_of_class and 12 * 60 < minutes(r['end_time']) and start < end_of_class - 5:
                    early += 1
        if early:
            flags[school_id].append('starts_before_dismissal')
        for r in rows:
            start, end = minutes(r['start_time']), minutes(r['end_time'])
            if start is not None and end is not None and (end - start > 180 or end - start < 20):
                flags[school_id].append('very_long_or_short')
                break
        if any(r['grade1'] == 'true' and (r['grade_upper'] or 9) <= 3 and (minutes(r['end_time']) or 0) > 17 * 60 for r in paid):
            flags[school_id].append('late_lower_grade')
        custom = [r for r in rows if r['kind'] == '맞춤형']
        if custom and all(any(w in r['name'] for w in ('맞춤형', '프로그램', '교실')) for r in custom):
            flags[school_id].append('generic_custom_name')

    counts = Counter(code for codes in flags.values() for code in codes)
    by_cause = Counter()
    for code, n in counts.items():
        by_cause[CHECKS[code][0]] += n
    defects = {school_id for school_id, codes in flags.items() if any(CHECKS[c][0] != 'info' for c in codes)}
    report = {
        'seoul_schools': len(seoul), 'published': sum(1 for s in seoul if s in summary),
        'schools_flagged': len(defects), 'schools_clean': len(seoul) - len(defects),
        'by_check': {code: {'cause': CHECKS[code][0], 'schools': counts[code], 'what': CHECKS[code][1]}
                     for code in CHECKS if counts[code]},
        'by_cause': dict(by_cause),
    }
    print(json.dumps(report, ensure_ascii=False, indent=1))
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['school_id', '학교', '등급', '점검', '원인'])
            for school_id, codes in sorted(flags.items()):
                writer.writerow([school_id, seoul[school_id], (summary.get(school_id) or {}).get('tier', ''),
                                 ' / '.join(CHECKS[c][1] for c in codes), ' / '.join(sorted({CHECKS[c][0] for c in codes}))])


if __name__ == '__main__':
    main()
