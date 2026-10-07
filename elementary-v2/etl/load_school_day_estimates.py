"""Load the reviewed "초1 하루 예상" data into the SQL 26 tables. Dry-run by default.

Sources (reviewed, user-confirmed):
  docs/research/audit2/school_day_review_first_pass_20261007.json   grade-1 clocks
  docs/research/audit2/grade1_dismissal_estimates_20261007.json     weekday periods and dismissal
  docs/research/audit2/care_review_first_pass_20261007.json         school care hours

Rows are checked locally against the SQL 26 constraints before anything is sent. `--apply`
needs SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY, SQL 26 applied, and upserts
then removes rows from earlier snapshots (same pattern as collect_care_data.py).

    python -m etl.load_school_day_estimates            # dry-run: counts + runtime preview
    python -m etl.load_school_day_estimates --apply
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
PREVIEW = ROOT / 'etl/runtime/school_day_estimates_preview.json'
WEEKDAYS = ['월', '화', '수', '목', '금']
SOURCE_YEAR, ENTRY_YEAR = 2026, 2027


def _load(name: str) -> dict:
    return json.loads((AUDIT2 / name).read_text(encoding='utf-8'))


def periods_source_label(used: set[str]) -> str:
    """'NEIS term1_regular+term2_early' style ids -> the wording a parent reads."""
    terms, document = set(), False
    for value in used:
        if value == 'document':
            document = True
            continue
        for window in value.removeprefix('NEIS ').split('+'):
            terms.add('1학기' if window.startswith('term1') else '2학기')
    parts = [f"NEIS {SOURCE_YEAR} 시간표({'·'.join(sorted(terms))})"] if terms else []
    if document:
        parts.append('학교 교육과정 문서')
    return ' + '.join(parts) or '없음'


def build_rows(snapshot: str) -> dict[str, list[dict[str, Any]]]:
    review = {s['school_id']: s for s in _load('school_day_review_first_pass_20261007.json')['schools']}
    estimates = _load('grade1_dismissal_estimates_20261007.json')
    care = _load('care_review_first_pass_20261007.json')
    reviewed_on = '2026-10-07'
    days, weekdays = [], []
    for est in estimates['schools']:
        clock = review[est['school_id']]
        sources = periods_source_label({v['periods_source'] for v in est['days'].values() if v['periods_source']})
        days.append({
            'school_id': est['school_id'], 'source_year': SOURCE_YEAR, 'applies_to_entry_year': ENTRY_YEAR,
            'lunch_position': clock['lunch_position'], 'p4_end': clock['p4_end'],
            'lunch_start': clock['lunch'][0], 'lunch_end': clock['lunch'][1], 'p5_end': clock['p5_end'],
            'p5_end_inferred': any(i.startswith('p5_end') for i in clock.get('inferred', [])),
            'clock_source': '학교알리미 2-가 학교교육과정 2026년 4월 공시',
            'periods_source': sources,
            'reviewed_on': reviewed_on, 'snapshot_date': snapshot,
        })
        for index, day in enumerate(WEEKDAYS, 1):
            value = est['days'][day]
            weekdays.append({'school_id': est['school_id'], 'weekday': index, 'periods': value['periods'],
                             'dismissal': value['dismissal'], 'note': value.get('note')})
    care_rows = []
    for school in care['schools']:
        stated = not school.get('unknown')
        care_rows.append({
            'school_id': school['school_id'], 'source_year': SOURCE_YEAR,
            'status': 'stated' if stated else 'school_check_needed',
            'afternoon_end': school.get('afternoon_end') if stated else None,
            'extended_end': school.get('extended_end') if stated else None,
            'extended_condition': school.get('extended_condition') if stated else None,
            'morning_hours': school.get('morning') if stated else None,
            'grades': school.get('grades') if stated else None,
            'source': '학교알리미 15-라 방과후·돌봄 운영 계획 2026년 5월 공시',
            'reviewed_on': '2026-10-07', 'snapshot_date': snapshot,
        })
    return {'school_day_estimates': days, 'school_day_estimate_weekdays': weekdays, 'school_care_hours': care_rows}


def violations(rows: dict[str, list[dict[str, Any]]]) -> list[str]:
    """The SQL 26 CHECK constraints, evaluated before upload."""
    problems = []
    day_ids = {r['school_id'] for r in rows['school_day_estimates']}
    for r in rows['school_day_estimates']:
        if r['lunch_position'] not in ('after_p4', 'before_p4'):
            problems.append(f"{r['school_id']}: lunch_position")
        if r['lunch_start'] and r['lunch_end'] and not r['lunch_start'] < r['lunch_end']:
            problems.append(f"{r['school_id']}: lunch order")
    seen = set()
    for r in rows['school_day_estimate_weekdays']:
        key = (r['school_id'], r['weekday'])
        if key in seen:
            problems.append(f'{key}: duplicate weekday')
        seen.add(key)
        if r['school_id'] not in day_ids:
            problems.append(f'{key}: no parent estimate')
        if r['dismissal'] is None and r['note'] != 'school_check_needed':
            problems.append(f'{key}: empty dismissal without school_check_needed')
        if r['note'] == 'school_check_needed' and r['dismissal'] is not None:
            problems.append(f'{key}: school_check_needed with a time')
        if r['note'] not in (None, 'inferred', 'school_check_needed'):
            problems.append(f'{key}: note')
        if r['periods'] is not None and not 1 <= r['periods'] <= 7:
            problems.append(f'{key}: periods')
    for r in rows['school_care_hours']:
        if r['status'] == 'stated' and not r['afternoon_end']:
            problems.append(f"{r['school_id']}: stated without afternoon_end")
        if r['status'] == 'school_check_needed' and (r['afternoon_end'] or r['extended_end']):
            problems.append(f"{r['school_id']}: unknown with hours")
        if r['extended_end'] and r['afternoon_end'] and not r['extended_end'] > r['afternoon_end']:
            problems.append(f"{r['school_id']}: extended_end not after afternoon_end")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='upload after SQL 26 has been applied')
    parser.add_argument('--write-fixture', action='store_true', help='also write src/dev-fixtures/ for the local card (git-ignored)')
    args = parser.parse_args()
    snapshot = date.today().isoformat()
    rows = build_rows(snapshot)
    problems = violations(rows)
    report = {'mode': 'apply' if args.apply else 'dry-run', 'snapshot_date': snapshot,
              'counts': {table: len(items) for table, items in rows.items()}, 'violations': problems}
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
    if args.write_fixture and not problems:
        fixture = ROOT / 'src/dev-fixtures/school-day-estimates.json'
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    if problems:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit('constraint violations; nothing uploaded')
    if args.apply:
        from etl.collect_care_data import credentials, rest
        url, service_key, _ = credentials()
        # parents first (weekdays reference them); dropping an earlier-snapshot parent cascades its weekdays
        for table, conflict in (('school_day_estimates', 'school_id'), ('school_day_estimate_weekdays', 'school_id,weekday'),
                                ('school_care_hours', 'school_id')):
            items = rows[table]
            for start in range(0, len(items), 500):
                rest(url, service_key, f'{table}?on_conflict={conflict}', method='POST', data=items[start:start + 500],
                     headers={'Prefer': 'resolution=merge-duplicates,return=minimal'})
        for table in ('school_day_estimates', 'school_care_hours'):
            rest(url, service_key, f'{table}?snapshot_date=lt.{snapshot}', method='DELETE', headers={'Prefer': 'return=minimal'})
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
