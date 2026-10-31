"""Reproduce a local v14 compatibility preview; this is not a fresh extraction or approval.

Migrates the frozen first-pass rows with place=None (not yet re-reviewed). Only 위례고운's
explicit L348 conditional times are added, then joined with a named local grade-1 estimate.
Never reads credentials, fetches a DB, uploads, or advances the P1 review gate.
"""
import argparse
import hashlib
import json
from pathlib import Path

from etl.load_school_afterschool import build, load_period_estimates, table_rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--period-estimates', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        raise SystemExit('Use a new output directory; existing candidates are never overwritten')
    args.out.mkdir(parents=True)
    fingerprints = {}
    for path in sorted(args.source.glob('batch_*.json')):
        schools = json.loads(path.read_text(encoding='utf8'))
        fingerprints[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        for school in schools:
            if any(len(row) != 13 for row in school['rows']):
                raise ValueError('Expected frozen v3 13-column first-pass rows')
            school['rows'] = [row[:-1] + [None, row[-1]] for row in school['rows']]
            school['note'] = (school.get('note') or '') + ' | 14-column compatibility candidate; place not re-reviewed'
            if school['school_id'] == 'B000024240':
                school['period_slots'] = {'2': ['10:40', '12:00'], '4': ['13:00', '14:20'], '5': ['13:50', '15:10']}
        (args.out / path.name).write_text(json.dumps(schools, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    records, counts = build([args.out], period_estimates=load_period_estimates([args.period_estimates]))
    rows = table_rows(records, '2026-10-21', include_sql32=True)
    report = {'schema_version': 'pivot-p1-v14-compatibility-preview-v1',
              'publish_status': 'not_approved', 'fresh_extraction': False,
              'no_operational_upload': True, 'stage2_authorized_by_gate': False,
              'place_review_complete': False, 'source_sha256': fingerprints,
              'period_estimates_file': args.period_estimates.as_posix(),
              'period_estimates_sha256': hashlib.sha256(args.period_estimates.read_bytes()).hexdigest(),
              'conditional_slot_evidence': 'B000024240 numbered full input L348, 2026 학교알리미 15-라',
              'counts': counts, 'program_rows': len(rows['school_afterschool_programs']),
              'derived_rows': [r for r in rows['school_afterschool_programs'] if r['time_source'] == 'period_slot']}
    (args.out / 'pivot_preview.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'program_rows': report['program_rows'], 'derived_rows': len(report['derived_rows']),
                      'publish_status': 'not_approved'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
