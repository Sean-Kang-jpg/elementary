"""Local P1 participation review/preview. No DB access or enrollment claims from course names.

python -m etl.pivot_p1_participation --outputs PATH --review PATH --period-estimates PATH --out PATH
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from etl.afterschool_rules import resolve_period_slots
from etl.load_school_afterschool import clean_row, load_period_estimates


def expected_mode(row: list) -> str:
    if row[0] == '방과후':
        return 'course_choice'
    if row[0] == '맞춤형':
        return 'care_activity' if row[12] == '돌봄내' else 'class_day_bundle'
    raise ValueError('Unknown programme kind')


def validate_groups(rows: list[list], assessment: dict) -> list[dict]:
    """A group needs source-backed review; normal custom rows cannot be relabeled as care."""
    shown = {i for i, r in enumerate(rows, 1) if r[10] == '학기' and r[9] != 'false'}
    groups = assessment['participation_groups']
    covered, ids = set(), set()
    for group in groups:
        if not group.get('group_id') or group['group_id'] in ids:
            raise ValueError('Participation group IDs must be unique')
        ids.add(group['group_id'])
        members = group['rows']
        if not members or not group.get('evidence'):
            raise ValueError('Participation groups need members and source evidence')
        for index in members:
            if type(index) is not int or index not in shown or index in covered:
                raise ValueError('Each shown row must belong to exactly one participation group')
            if expected_mode(rows[index - 1]) != group['mode']:
                raise ValueError('Participation mode contradicts kind/place; custom times cannot be waived')
            covered.add(index)
        if group['mode'] == 'care_activity':
            if group.get('individually_selectable') is not False:
                raise ValueError('Care activities are not individually selectable courses')
        elif group['mode'] == 'class_day_bundle':
            if group.get('individually_selectable') is not False:
                raise ValueError('Bundle activity names cannot become individual choices')
        elif group.get('individually_selectable') is not True:
            raise ValueError('Course choices must remain selectable')
        keys = ((rows[i - 1][1], rows[i - 1][2]) if group['mode'] == 'course_choice'
                else (rows[i - 1][4], rows[i - 1][3], rows[i - 1][11]) for i in members)
        if len(set(keys)) != 1:
            raise ValueError('A participation group cannot combine different courses or class/term enrollments')
    if covered != shown:
        raise ValueError('Participation review must cover every shown row')
    return groups


def care_hours_complete(assessment: dict, groups: list[dict]) -> bool:
    if not any(g['mode'] == 'care_activity' for g in groups):
        return True
    hours = assessment.get('care_hours', {})
    end = hours.get('end')
    valid_end = (isinstance(end, str) and len(end) == 5 and end[2] == ':'
                 and end[:2].isdigit() and end[3:].isdigit()
                 and 0 <= int(end[:2]) <= 23 and 0 <= int(end[3:]) <= 59)
    return (assessment.get('care_hours_review_complete') is True
            and hours.get('days') == '월화수목금' and valid_end
            and hours.get('start_basis') == 'after_regular_classes' and bool(hours.get('evidence')))


def preview(outputs: Path, review: dict, periods: dict, digest: str) -> dict:
    from etl.pivot_p1_review_gate import evaluate
    if review.get('schema_version') != 'pivot-p1-source-review-v3':
        raise ValueError('Participation preview requires a v3 participation review')
    gate = evaluate(outputs, review, periods, digest)
    sources = {}
    for path in sorted(outputs.glob('batch_*.json')):
        for school in json.loads(path.read_text(encoding='utf8')):
            sources[school['school_id']] = school
    schools = []
    for assessment in review['schools']:
        source = sources[assessment['school_id']]
        buckets = {'selectable_courses': [], 'custom_bundles': [], 'care_activities': []}
        for group in validate_groups(source['rows'], assessment):
            activities = []
            for index in group['rows']:
                cleaned = clean_row(source['rows'][index - 1])
                for r in resolve_period_slots([cleaned], source.get('period_slots', {}),
                                              periods.get(source['school_id'], {})):
                    activities.append({'source_row': index, **{k: r.get(k) for k in
                        ('name', 'section', 'grades_raw', 'days', 'start', 'end', 'term', 'place', 'time_source')}})
            item = {**group, 'activities': activities}
            key = {'course_choice': 'selectable_courses', 'class_day_bundle': 'custom_bundles',
                   'care_activity': 'care_activities'}[group['mode']]
            buckets[key].append(item)
        schools.append({'school_id': source['school_id'], **buckets,
                        'care_hours': assessment.get('care_hours'),
                        'eligibility_notes': assessment.get('eligibility_notes', []),
                        'advisory_issues': assessment.get('advisory_issues', [])})
    return {'schema_version': 'pivot-p1-participation-preview-v1', 'publish_status': 'not_approved',
            'no_operational_upload': True, 'operational_readiness': review.get('operational_readiness'),
            'gate': gate, 'schools': schools}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--outputs', type=Path, required=True)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--period-estimates', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    review = json.loads(args.review.read_text(encoding='utf8'))
    result = preview(args.outputs, review, load_period_estimates([args.period_estimates]),
                     hashlib.sha256(args.period_estimates.read_bytes()).hexdigest())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'schools': len(result['schools']), 'stage1_passed': result['gate']['stage1_passed'],
                      'publish_status': result['publish_status']}))


if __name__ == '__main__':
    main()
