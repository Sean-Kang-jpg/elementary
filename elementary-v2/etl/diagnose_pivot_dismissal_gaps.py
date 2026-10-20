"""P2: why does a pilot school have no "초1 하루 예상" dismissal estimate?

For every pilot school the manifest lists as missing `dismissal`, walk the Audit 2 pipeline
records in order and stop at the first stage the school did not pass:

  not_in_wave       no extraction wave ever listed the school
  no_attachment     the 2-가 disclosure had no curriculum attachment
  unreadable        the attachment could not be turned into text
  no_clock          text was read but no bell schedule (시정표) was found, or only its heading
  not_reviewed      a schedule was found but no reviewed clock entry exists (rejected or dropped)
  excluded          the review excluded the school (no regular grade-1 clock)
  not_estimated     a reviewed clock exists but no weekday estimate was built
  not_loaded        an estimate exists but the loader did not publish it

Reads only files in docs/research/audit2 and the pivot manifest; writes one JSON report.

    python -m etl.diagnose_pivot_dismissal_gaps
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
PIVOT = ROOT / 'docs/research/pivot'

# one row per extraction wave, oldest first; a later wave overrides an earlier one
WAVES = [
    {'name': 'poc', 'manifest': 'poc_school_manifest_20261006.json', 'clock_audit': 'schoolinfo_daily_clock_audit_20261006.json',
     'review': 'school_day_review_first_pass_20261007.json', 'estimates': 'grade1_dismissal_estimates_20261007.json'},
    {'name': 'expansion', 'manifest': 'pilot_expansion_manifest_20261008.json', 'clock_audit': 'schoolinfo_daily_clock_audit_expansion_20261008.json',
     'review': 'school_day_review_expansion_20261008.json', 'estimates': 'grade1_dismissal_estimates_expansion_20261008.json'},
    {'name': 'wave2_seoul', 'manifest': 'wave2_seoul_manifest_20261009.json', 'clock_audit': 'schoolinfo_daily_clock_audit_wave2_seoul_20261009.json',
     'review': 'school_day_review_wave2_seoul_20261010.json', 'estimates': 'grade1_dismissal_estimates_wave2_seoul_20261010.json'},
    {'name': 'wave3_gyeonggi', 'manifest': 'wave3_gyeonggi_manifest_20261010.json', 'clock_audit': 'schoolinfo_daily_clock_audit_wave3_gyeonggi_20261010.json',
     'review': 'school_day_review_wave3_gyeonggi_20261011.json', 'estimates': 'grade1_dismissal_estimates_wave3_gyeonggi_20261011.json'},
]
CLOCK_STATUS_REASON = {'no_attachment': 'no_attachment', 'unreadable': 'unreadable',
                       'no_clock_detected': 'no_clock', 'clock_heading_only': 'no_clock'}


def load(name: str) -> dict:
    path = AUDIT2 / name
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def by_id(records: list | None) -> dict[str, dict]:
    return {r['school_id']: r for r in records or [] if isinstance(r, dict) and 'school_id' in r}


def excluded_ids(review: dict) -> set[str]:
    out = set()
    for item in review.get('excluded_no_regular_clock') or []:
        out.add(item['school_id'] if isinstance(item, dict) else item)
    return out


def diagnose_school(sid: str, waves: list[dict]) -> dict:
    trail = []
    for wave in waves:
        if sid not in wave['manifest']:
            continue
        audit = wave['clock_audit'].get(sid)
        step = {'wave': wave['name'], 'clock_status': audit.get('status') if audit else None}
        if audit is None:
            step['reason'] = 'not_audited'
        elif audit.get('status') in CLOCK_STATUS_REASON:
            step['reason'] = CLOCK_STATUS_REASON[audit['status']]
        elif sid in wave['excluded']:
            step['reason'] = 'excluded'
        elif sid not in wave['review']:
            step['reason'] = 'not_reviewed'
        elif sid not in wave['estimates']:
            step['reason'] = 'not_estimated'
            step['review_note'] = wave['review'][sid].get('note')
        else:
            step['reason'] = 'not_loaded'
            step['estimate_status'] = wave['estimates'][sid].get('status')
        trail.append(step)
    reason = trail[-1]['reason'] if trail else 'not_in_wave'
    return {'reason': reason, 'trail': trail}


def main() -> None:
    manifests = sorted(PIVOT.glob('pilot_manifest_*.json'))
    if not manifests:
        raise SystemExit('run python -m etl.build_pivot_pilot_manifest first')
    pilot = json.loads(manifests[-1].read_text(encoding='utf-8'))
    waves = []
    for wave in WAVES:
        review = load(wave['review'])
        waves.append({
            'name': wave['name'],
            'manifest': by_id(load(wave['manifest']).get('schools')),
            'clock_audit': by_id(load(wave['clock_audit']).get('schools')),
            'review': by_id(review.get('schools')),
            'excluded': excluded_ids(review),
            'estimates': by_id(load(wave['estimates']).get('schools')),
        })

    rows = []
    for school in pilot['schools']:
        if 'dismissal' not in school['missing']:
            continue
        result = diagnose_school(school['school_id'], waves)
        rows.append({key: school[key] for key in ('school_id', 'school_name', 'area', 'stage', 'operating_pilot')} | result)

    summary = {
        'all': dict(Counter(r['reason'] for r in rows)),
        'operating_pilot': dict(Counter(r['reason'] for r in rows if r['operating_pilot'])),
        'by_stage': {stage: dict(Counter(r['reason'] for r in rows if r['stage'] == stage)) for stage in (1, 2, 3)},
    }
    report = {'source_manifest': manifests[-1].name, 'missing_dismissal': len(rows), 'summary': summary, 'schools': rows}
    out = PIVOT / manifests[-1].name.replace('pilot_manifest_', 'p2_gap_diagnosis_')
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f'wrote {out.relative_to(ROOT)} ({len(rows)} schools)')


if __name__ == '__main__':
    main()
