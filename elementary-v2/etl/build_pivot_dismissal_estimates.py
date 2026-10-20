"""P2: grade-1 dismissal per weekday for pilot schools reviewed from their 15-라 plans.

Same rule as `build_grade1_dismissal_estimates` (reviewed clock × NEIS grade-1 periods per
weekday, NEIS wins over document periods), with two differences: the NEIS periods are looked
up across every Audit 2 candidates file, and a 4-period day whose lunch end was read from the
5th-period start is marked `inferred` like an inferred 5th-period end.

    python -m etl.build_pivot_dismissal_estimates
"""
from __future__ import annotations

import json
from pathlib import Path

from etl.build_grade1_dismissal_estimates import WEEKDAYS, dismissal


ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
PIVOT = ROOT / 'docs/research/pivot'
REVIEW = PIVOT / 'p2_school_day_review_pilot_20261021.json'
OUT = PIVOT / 'p2_dismissal_estimates_pilot_20261021.json'
CARE_OUT = PIVOT / 'p2_care_review_pilot_20261021.json'


def neis_candidates() -> dict[str, dict]:
    found: dict[str, dict] = {}
    for path in sorted(AUDIT2.glob('school_day_periods_candidates_*.json')):
        for school in json.loads(path.read_text(encoding='utf-8'))['schools']:
            if school.get('grade1_weekday_periods'):
                found.setdefault(school['school_id'], school)
    return found


def main() -> None:
    review = json.loads(REVIEW.read_text(encoding='utf-8'))
    candidates = neis_candidates()
    rows = []
    for school in review['schools']:
        candidate = candidates.get(school['school_id'], {})
        neis = candidate.get('grade1_weekday_periods') or {}
        source = candidate.get('periods_source')
        doc = school.get('doc_periods')
        inferred = set(school.get('inferred', []))
        days, conflicts = {}, []
        for index, day in enumerate(WEEKDAYS):
            from_neis = neis.get(day)
            from_doc = doc[index] if doc else None
            periods = from_neis if from_neis is not None else from_doc
            if from_neis is not None and from_doc is not None and from_neis != from_doc:
                conflicts.append({'day': day, 'neis': from_neis, 'document': from_doc})
            time = dismissal(school, periods)
            note = None
            if time is None:
                note = 'school_check_needed'
            elif (periods == 5 and any(i.startswith('p5_end') for i in inferred)) or \
                 (periods == 4 and any(i.startswith('lunch_end') for i in inferred)):
                note = 'inferred'
            days[day] = {'periods': periods,
                         'periods_source': source if from_neis is not None else 'document' if from_doc is not None else None,
                         'dismissal': time, 'note': note}
        complete = all(v['dismissal'] for v in days.values())
        rows.append({'school_id': school['school_id'], 'school_name': school['school_name'], 'confidence': school['confidence'],
                     'lunch_position': school['lunch_position'], 'days': days, 'period_conflicts': conflicts,
                     'status': 'complete' if complete else 'incomplete'})
    summary = {'schools': len(rows), 'complete': sum(r['status'] == 'complete' for r in rows),
               'with_period_conflict': sum(bool(r['period_conflicts']) for r in rows),
               'inferred_days': sum(v['note'] == 'inferred' for r in rows for v in r['days'].values())}
    OUT.write_text(json.dumps({'schema_version': 'grade1-dismissal-estimates-v1', 'evidence_state': 'estimated_from_2026_sources',
                               'review_state': review['reviewer'], 'publish_status': 'not_approved', 'no_operational_upload': True,
                               'summary': summary, 'schools': rows}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # care hours for these schools are already published from earlier waves; the loader's set needs a care file
    CARE_OUT.write_text(json.dumps({'schema_version': 'care-review-v1', 'note': 'care hours already published by earlier waves',
                                    'schools': []}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))
    for r in rows:
        print(r['school_id'], r['status'], {d: (v['periods'], v['dismissal'], v['note']) for d, v in r['days'].items()})


if __name__ == '__main__':
    main()
