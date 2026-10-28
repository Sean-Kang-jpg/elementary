"""Build isolated priority-school slot review packets; never connects to a database."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from etl.afterschool_rules import merge_terms, resolve_period_slots
from etl.afterschool_slots import school_slots, slot_kind

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = ('kind', 'name', 'variant', 'section', 'grades_raw', 'grade_source',
           'days', 'start', 'end', 'grade1', 'period', 'term', 'place', 'line')
CONFLICT_AXES = {'weekday_source_conflict': '요일', 'duration_conflict': '시각',
                 'source_duration_conflict': '시각', 'english_a_clock_mapping_ambiguous': '시각',
                 'grade_source_conflict': '학년'}


def packet(school: dict, review: dict, manifest: dict) -> dict:
    rows = []
    for values in school['rows']:
        if len(values) != 14:
            raise ValueError('Expected v3 14-column rows')
        rows.append(dict(zip(COLUMNS, values)))
    conflicts = list(school.get('conflicts', []))
    reference = []
    for issue in review.get('blocking_issues', []):
        axis = CONFLICT_AXES.get(issue['code'])
        if not axis:
            reference.append(issue)
            continue
        affected = [r for r in rows if r['line'] in issue.get('lines', [])]
        label = ' / '.join(dict.fromkeys(
            ' '.join(filter(None, [r['name'], r['section']])) for r in affected))
        conflicts.append([axis, label or issue['code'],
                          ' / '.join(f'L{n}' for n in issue.get('lines', []))])
    periods = school.get('period_slots', {})
    # With no published weekday-period map, the shared rule leaves times empty.
    resolved = merge_terms(resolve_period_slots(rows, periods, {}))
    pdf_only = bool(manifest['sources']) and all(s['format'] == 'pdf' for s in manifest['sources'])
    result = school_slots(resolved, conflicts=conflicts, pdf_only=pdf_only)
    for issue in reference:
        if issue['code'] == 'care_custom_classification_pending':
            result['checks'].append(['돌봄내분류확인', None, issue.get('lines', [])])
    untimed = [r for r in resolved if slot_kind(r) and
               (not r['days'] or not r['start'] or not r['end'])]
    # A programme list lacking its timetable is not evidence of no operation.
    for r in untimed:
        if r['kind'] == '방과후':
            result['checks'].append(['방과후시각미확인', r['days'],
                                     [r['name'], r['section'], f"L{r['line']}"]])
    if result['checks']:
        result['status'] = 'check'
    for slot in result['slots']:
        slot['source_rows'] = [i for i, r in enumerate(rows, 1)
                               if slot_kind(r) == slot['kind'] and
                               slot['weekday'] in (r['days'] or '') and
                               r['start'] == slot['start'] and r['end'] == slot['end']]
        slot['source_lines'] = sorted({rows[i-1]['line'] for i in slot['source_rows']})
    return {'school_id': school['school_id'], 'school_name': manifest['school_name'],
            'rows': school['rows'], 'conflicts': conflicts, 'period_slots': periods,
            **result, 'reference_findings': reference, 'source_pdf_only': pdf_only,
            'independent_review_complete': False, 'approved_for_upload': False,
            'production_apply_ready': False}


def build(manifest_path: Path, output_dir: Path, review_paths: list[Path]) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    targets = {s['school_id']: s for s in manifest['schools'] if s['course_track'] == 'new_priority'}
    reviews = {}
    for path in review_paths:
        for review in json.loads(path.read_text(encoding='utf-8'))['schools']:
            if review['school_id'] in reviews:
                raise ValueError('Duplicate school review')
            reviews[review['school_id']] = review
    packets = []
    for path in sorted(output_dir.glob('*.json')):
        for school in json.loads(path.read_text(encoding='utf-8')):
            sid = school['school_id']
            if sid not in targets or sid not in reviews:
                raise ValueError(f'Unexpected or unreviewed school {sid}')
            review = reviews[sid]
            source = ROOT / review['input']
            if hashlib.sha256(source.read_bytes()).hexdigest() != targets[sid]['input_sha256']:
                raise ValueError(f'Changed prepared input {sid}')
            if hashlib.sha256(path.read_bytes()).hexdigest() != review['output_sha256']:
                raise ValueError(f'Changed reviewed output {sid}')
            item = packet(school, review, targets[sid])
            item['input_sha256'] = targets[sid]['input_sha256']
            item['output_sha256'] = review['output_sha256']
            packets.append(item)
    if len({s['school_id'] for s in packets}) != len(packets):
        raise ValueError('Duplicate output school')
    return {'standard': 'docs/operations/PIVOT_SLOT_STANDARD.md',
            'standard_sha256': hashlib.sha256((ROOT/'docs/operations/PIVOT_SLOT_STANDARD.md').read_bytes()).hexdigest(),
            'no_operational_upload': True,
            'summary': {'schools': len(packets), 'course_rows': sum(len(s['rows']) for s in packets),
                        'slots': sum(len(s['slots']) for s in packets),
                        'slot_kinds': dict(Counter(slot['kind'] for s in packets for slot in s['slots'])),
                        'statuses': dict(Counter(s['status'] for s in packets))},
            'scope_limit': 'Derived slot candidates, not independent validation or upload approval',
            'schools': packets}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--outputs', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, nargs='+', required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    report = build(args.manifest, args.outputs, args.reviews)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
