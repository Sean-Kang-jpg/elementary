"""Estimated grade-1 하교 per weekday = reviewed 시정표 × grade-1 periods per weekday.

Periods come from NEIS (first-term regular window, else second term; a weekday whose mode
covers under 80% of observations is unknown) and fall back to the periods printed in the
school's own document. Where both exist and differ, NEIS wins and the day is listed as a
conflict for review. A 4-period day ends after lunch when lunch follows 4교시, otherwise at
the end of 4교시. Every value is a 2026 figure shown to 2027 entrants as `estimated`.

    python -m etl.build_grade1_dismissal_estimates
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/research/audit2/school_day_review_first_pass_20261007.json'
CANDIDATES = ROOT / 'docs/research/audit2/school_day_periods_candidates_20261007.json'
OUT = ROOT / 'docs/research/audit2/grade1_dismissal_estimates_20261007.json'
WEEKDAYS = ['월', '화', '수', '목', '금']
# Days the reviewer could not settle from the document; never filled in by rule.
UNRESOLVED = {('B000006702', '수')}


def dismissal(school: dict, periods: int | None) -> str | None:
    if periods == 4:
        return school['lunch'][1] if school['lunch_position'] == 'after_p4' else school['p4_end']
    if periods == 5:
        return school['p5_end']
    return None


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--review', default=str(REVIEW))
    parser.add_argument('--candidates', default=str(CANDIDATES))
    parser.add_argument('--out', default=str(OUT))
    args = parser.parse_args()
    review = json.loads(Path(args.review).read_text(encoding='utf-8'))
    candidates = {s['school_id']: s for s in json.loads(Path(args.candidates).read_text(encoding='utf-8'))['schools']}
    rows = []
    for school in review['schools']:
        neis = candidates[school['school_id']]['grade1_weekday_periods']
        source = candidates[school['school_id']]['periods_source']
        doc = school.get('doc_periods')
        days, conflicts = {}, []
        for index, day in enumerate(WEEKDAYS):
            from_neis = neis.get(day)
            from_doc = doc[index] if doc else None
            periods = from_neis if from_neis is not None else from_doc
            if from_neis is not None and from_doc is not None and from_neis != from_doc:
                conflicts.append({'day': day, 'neis': from_neis, 'document': from_doc})
            time = None if (school['school_id'], day) in UNRESOLVED else dismissal(school, periods)
            # user decisions 2026-10-07: inferred block ends carry a 추정 note; gaps say 학교 확인 필요
            note = None
            if time is None:
                note = 'school_check_needed'
            elif periods == 5 and any(i.startswith('p5_end') for i in school.get('inferred', [])):
                note = 'inferred'
            days[day] = {'periods': periods, 'periods_source': (source if from_neis is not None else 'document' if from_doc is not None else None),
                         'dismissal': time, 'note': note}
        complete = all(v['dismissal'] for v in days.values())
        rows.append({'school_id': school['school_id'], 'school_name': school['school_name'], 'confidence': school['confidence'],
                     'lunch_position': school['lunch_position'], 'days': days, 'period_conflicts': conflicts,
                     'status': 'complete' if complete else 'incomplete'})
    summary = {'schools': len(rows), 'complete': sum(r['status'] == 'complete' for r in rows),
               'with_period_conflict': sum(bool(r['period_conflicts']) for r in rows)}
    Path(args.out).write_text(json.dumps({'schema_version': 'grade1-dismissal-estimates-v1', 'evidence_state': 'estimated_from_2026_sources',
                               'review_state': review.get('reviewer', ''), 'publish_status': 'not_approved',
                               'no_operational_upload': True, 'summary': summary, 'schools': rows}, ensure_ascii=False, indent=2) + '\n',
                   encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
