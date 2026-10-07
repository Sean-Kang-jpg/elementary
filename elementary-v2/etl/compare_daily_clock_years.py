"""E04-c3: does a school's 2026 grade-1 clock already appear in its 2025 학교알리미 2-가 plan?

For each school in the reviewed 2026 set, the 2025 curriculum attachments are fetched (same
public download, git-ignored archive), clocks are detected with the same rules, and the four
reviewed 2026 key times (4교시 end, lunch start/end, 5교시 end) are looked up among the times of
the 2025 detected clock rows. All four present means "unchanged" for the purpose of using last
year's plan as an estimate; anything else is listed for a direct look, not judged here.

    python -m etl.compare_daily_clock_years
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import clock_blocks, clock_rows, fetch_text

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/research/audit2/school_day_review_first_pass_20261007.json'
PROBE_2025 = ROOT / 'docs/research/audit2/schoolinfo_disclosure_probe_2025_20261008.json'
OUT = ROOT / 'docs/research/audit2/daily_clock_year_comparison_20261008.json'


def key_times(school: dict) -> dict:
    return {'p4_end': school['p4_end'], 'lunch_start': school['lunch'][0], 'lunch_end': school['lunch'][1], 'p5_end': school['p5_end']}


def compare(keys: dict, rows: list[dict]) -> dict:
    seen = {r['start'] for r in rows} | {r['end'] for r in rows}
    missing = {name: value for name, value in keys.items() if value not in seen}
    return {'missing_2026_times': missing, 'status': 'same_key_times' if not missing else 'differs_or_unread'}


def main() -> None:
    review = {s['school_id']: s for s in json.loads(REVIEW.read_text(encoding='utf-8'))['schools']}
    probe = {s['school_id']: s for s in json.loads(PROBE_2025.read_text(encoding='utf-8'))['schools']}
    results = []
    for school_id, reviewed in review.items():
        listing = probe.get(school_id, {})
        record = {'school_id': school_id, 'school_name': reviewed['school_name'], 'keys_2026': key_times(reviewed)}
        attachments = [a for a in listing.get('items', {}).get('curriculum', {}).get('attachments', []) if a.get('kind') != 'academic_calendar']
        if not attachments:
            record['status'] = 'no_2025_attachment'
            results.append(record)
            continue
        rows, files = [], []
        for attachment in attachments:
            try:
                fetched = fetch_text(listing, attachment, 'curriculum', '2025')
                found = [r for block in clock_blocks(clock_rows(fetched['text'])) for r in block]
                rows.extend(found)
                files.append({'name': attachment['name'], 'sha256': fetched['sha256'], 'format': fetched['format'], 'clock_rows': len(found)})
            except Exception as error:  # record and continue
                files.append({'name': attachment['name'], 'error': type(error).__name__})
        record['files_2025'] = files
        record.update(compare(record['keys_2026'], rows) if rows else {'status': 'no_2025_clock_detected'})
        results.append(record)
    summary = Counter(r['status'] for r in results)
    OUT.write_text(json.dumps({'schema_version': 'daily-clock-year-comparison-v1', 'compared': '2025 vs reviewed 2026 grade-1 key times',
                               'no_operational_upload': True, 'summary': dict(summary), 'schools': results},
                              ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(summary), ensure_ascii=False))


if __name__ == '__main__':
    main()
