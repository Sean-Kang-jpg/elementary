"""Evaluate the P1 five-school review gate locally. Never uploads or starts stage 2.

python -m etl.pivot_p1_review_gate --outputs PATH --review PATH --out PATH
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from etl.afterschool_rules import resolve_period_slots
from etl.load_school_afterschool import clean_row, load_period_estimates

TEST_IDS = {'B000003766', 'B000003745', 'B000003753', 'B000003739', 'B000024240'}


def evaluate(outputs: Path, review: dict, period_estimates: dict | None = None,
             period_digest: str | None = None) -> dict:
    v2 = review.get('schema_version') == 'pivot-p1-source-review-v2'
    if period_estimates is not None and (not v2 or review.get('period_estimates_sha256') != period_digest
                                       or period_digest is None):
        raise ValueError('period estimates must match the reviewed fingerprint')
    extracted = {}
    for path in sorted(outputs.glob('batch_*.json')):
        for school in json.loads(path.read_text(encoding='utf8')):
            if school['school_id'] not in TEST_IDS:
                continue
            if school['school_id'] in extracted:
                raise ValueError('duplicate school output')
            extracted[school['school_id']] = (school, hashlib.sha256(path.read_bytes()).hexdigest())
    reviews = {s['school_id']: s for s in review['schools']}
    if set(extracted) != TEST_IDS or set(reviews) != TEST_IDS or len(review['schools']) != 5:
        raise ValueError('the five-school cohort must be complete and unique')
    results = []
    for sid in sorted(TEST_IDS):
        school, digest = extracted[sid]
        assessment = reviews[sid]
        if assessment['output_sha256'] != digest:
            raise ValueError(f'{sid}: output changed after review')
        rows = school['rows']
        if any(len(row) != (14 if v2 else 13) for row in rows):
            raise ValueError(f'{sid}: unexpected v3 row width')
        shown = {i for i, row in enumerate(rows, 1) if row[10] == '학기' and row[9] != 'false'}
        decisions = assessment['row_decisions']
        if len(decisions) != len({d['row'] for d in decisions}) or {d['row'] for d in decisions} != shown:
            raise ValueError(f'{sid}: review must cover every shown row exactly once')
        if any(d['verdict'] not in ('correct', 'wrong', 'needs_source_check') for d in decisions):
            raise ValueError(f'{sid}: unknown review verdict')
        correct = sum(d['verdict'] == 'correct' for d in decisions)
        incomplete, derived = [], []
        for i, row in enumerate(rows, 1):
            if row[0] != '맞춤형' or row[9] != 'true' or row[10] != '학기':
                continue
            cleaned = clean_row(row)
            resolved = resolve_period_slots([cleaned], school.get('period_slots', {}),
                                             (period_estimates or {}).get(sid, {})) if v2 else [cleaned]
            if any(not r.get(k) for r in resolved for k in ('days', 'start', 'end')):
                incomplete.append(i)
            if any(r.get('time_source') == 'period_slot' for r in resolved):
                derived.append(i)
        custom_count = sum(row[0] == '맞춤형' and row[9] == 'true' and row[10] == '학기' for row in rows)
        inventory_complete = (assessment['grade1_custom_inventory_complete'] is True
                              and custom_count == assessment['expected_grade1_custom_rows'])
        share = correct / len(shown) if shown else 0
        place_complete = not v2 or assessment.get('place_review_complete') is True
        results.append({'school_id': sid, 'shown_rows': len(shown), 'correct_rows': correct,
                        'accuracy_lower_bound': round(share, 4), 'incomplete_grade1_custom_rows': incomplete,
                        'grade1_custom_inventory_complete': inventory_complete,
                        **({'place_review_complete': place_complete, 'derived_grade1_custom_rows': derived} if v2 else {}),
                        'passed': share >= .9 and not incomplete and inventory_complete and place_complete
                                  and not assessment['blocking_issues']})
    total = sum(s['shown_rows'] for s in results)
    correct = sum(s['correct_rows'] for s in results)
    return {'schema_version': 'pivot-p1-review-gate-v2' if v2 else 'pivot-p1-review-gate-v1', 'no_operational_upload': True,
            'stage1_passed': all(s['passed'] for s in results),
            'stage2_authorized_by_gate': all(s['passed'] for s in results),
            'shown_rows': total, 'correct_rows': correct,
            'accuracy_lower_bound': round(correct / total, 4) if total else 0,
            'schools': results}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--outputs', required=True, type=Path)
    parser.add_argument('--review', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--period-estimates', type=Path)
    args = parser.parse_args()
    periods = load_period_estimates([args.period_estimates]) if args.period_estimates else None
    digest = hashlib.sha256(args.period_estimates.read_bytes()).hexdigest() if args.period_estimates else None
    result = evaluate(args.outputs, json.loads(args.review.read_text(encoding='utf8')), periods, digest)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
