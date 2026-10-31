"""Build local slot-review packets from audited P1 rows. Never uploads data.

The shared slot builder and user standard are read-only, fingerprinted inputs.
Only the two kinds covered by PIVOT_SLOT_STANDARD enter the blind-review list;
the builder's additional all-grade/unknown-grade display kinds remain reference.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

from etl.afterschool_rules import resolve_period_slots
from etl.load_school_afterschool import COLUMNS_V3_PLACE, PRIOR_YEAR
from etl.pivot_p1_stage2_audit import evaluate, read_bound

CORE_KINDS = {'맞춤형', '저학년방과후'}


def fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_conflicts(school: dict, assessment: dict) -> list:
    conflicts = list(school.get('conflicts', []))
    for item in conflicts:
        if (not isinstance(item, list) or len(item) != 3
                or item[0] not in ('요일', '시각', '학년')
                or any(not isinstance(v, str) or not v.strip() for v in item)):
            raise ValueError('Expected structured school conflicts')
        refs = [int(n) for n in re.findall(r'L(\d+)', item[2])]
        maximum = assessment.get('source_read_lines', [1, float('inf')])[1]
        if not refs or any(not 1 <= n <= maximum for n in refs):
            raise ValueError('Conflict evidence must reference the numbered source')
    # Older reviewed rows retained clock conflicts in their sidecar. Preserve
    # those checks until the source owner migrates them into the school object.
    for conflict in assessment.get('field_conflicts', []):
        names = sorted({school['rows'][i - 1][1] for i in conflict['rows']})
        refs = sorted({v['line'] for v in conflict['alternatives']})
        item = ['시각', ' / '.join(names), ' / '.join(f'L{n}' for n in refs)]
        if item not in conflicts:
            conflicts.append(item)
    return conflicts


def packet(school: dict, assessment: dict, builder, pdf_only: bool,
           periods: dict | None = None) -> dict:
    rows = [dict(zip(COLUMNS_V3_PLACE, values)) for values in school['rows']]
    eligible = []
    pending_period_rows = []
    untimed_custom_rows = []
    for index, row in enumerate(rows, 1):
        if PRIOR_YEAR.search(str(row.get('term') or '')) or builder.slot_kind(row) not in CORE_KINDS:
            continue
        # Period conditions describe custom programmes, not untimed paid classes.
        if row['kind'] == '맞춤형' and school.get('period_slots'):
            resolved = resolve_period_slots([row], school['period_slots'], periods or {})
            if not row['start'] and not row['end'] and any(not r.get('start') for r in resolved):
                pending_period_rows.append(index)
            eligible.extend(resolved)
            if any(not r.get('days') or not r.get('start') or not r.get('end') for r in resolved):
                untimed_custom_rows.append(index)
        else:
            eligible.append(row)
            if row['kind'] == '맞춤형' and any(not row.get(k) for k in ('days', 'start', 'end')):
                untimed_custom_rows.append(index)
    result = builder.school_slots(eligible, source_conflicts(school, assessment), pdf_only)
    # A timed care activity must not hide untimed independent custom classes on
    # the same weekday: eligibility differs even when their kind is identical.
    if untimed_custom_rows:
        result['checks'].append(['맞춤형미확정행', None, untimed_custom_rows])
    if pending_period_rows:
        result['checks'].append(['교시요일배정미확인', None, pending_period_rows])
    conditional = sorted({i for c in assessment.get('conditional_rows', [])
                          if c.get('confirmed_operating') is not True for i in c['rows']
                          if builder.slot_kind(rows[i - 1]) in CORE_KINDS})
    if conditional:
        result['checks'].append(['조건부개설미확인', None, conditional])
    if result['checks']:
        result['status'] = 'check'
    candidate = [[i, s['kind'], s['weekday'], s['start'], s['end'], s['courses']]
                 for i, s in enumerate(result['slots'], 1)]
    return {'school_id': school['school_id'], **result, 'candidate_slots': candidate,
            'period_slots': school.get('period_slots', {}),
            'source_scope_issues': assessment.get('blocking_issues', []),
            'grade1_custom_inventory_complete': assessment.get('grade1_custom_inventory_complete') is True,
            'independent_blind_review_complete': False, 'publish_ready': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('manifest', 'review', 'slot-builder', 'standard', 'out', 'candidates'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    audit = evaluate(args.manifest, args.review)
    spec = importlib.util.spec_from_file_location('p1_review_shared_slot_builder', args.slot_builder)
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    review = json.loads(args.review.read_text(encoding='utf8'))
    manifest = json.loads(args.manifest.read_text(encoding='utf8'))
    cohort = {s['school_id']: s for s in manifest['schools']}
    results = []
    args.candidates.mkdir(parents=True, exist_ok=True)
    for assessment in review['schools']:
        school = json.loads(read_bound(assessment['output_file'], assessment['output_sha256']))[0]
        sources = cohort[school['school_id']]['source_files']
        pdf_only = bool(sources) and all(s.get('ext', Path(s.get('file', s.get('name', ''))).suffix.lstrip('.')).lower() == 'pdf'
                                         for s in sources)
        result = packet(school, assessment, builder, pdf_only)
        path = args.candidates / (school['school_id'] + '.json')
        path.write_text(json.dumps(result['candidate_slots'], ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        result['candidate_file'] = path.as_posix()
        result['candidate_sha256'] = fingerprint(path)
        result['output_sha256'] = assessment['output_sha256']
        results.append(result)
    report = {'schema_version': 'pivot-p1-core-slot-review-v1',
              'scope': sorted(CORE_KINDS), 'policy_file': args.standard.as_posix(),
              'policy_sha256': fingerprint(args.standard),
              'slot_builder_file': args.slot_builder.as_posix(),
              'slot_builder_sha256': fingerprint(args.slot_builder),
              'review_adapter_sha256': fingerprint(Path(__file__)),
              'rules_sha256': fingerprint(Path(__file__).with_name('afterschool_rules.py')),
              'grade_parser_sha256': fingerprint(Path(__file__).with_name('load_school_afterschool.py')),
              'review_sha256': fingerprint(args.review),
              'period_assignment': 'unresolved; no DB or weekday-period estimates read',
              'source_extraction_schools': audit['schools_with_source_extraction'],
              'remaining_school_ids': audit['remaining_school_ids'],
              'core_slots': sum(len(s['slots']) for s in results),
              'status_counts': {status: sum(s['status'] == status for s in results)
                                for status in ('ok', 'check', 'none')},
              'independent_blind_review_complete': False, 'publish_ready': False,
              'no_operational_upload': True, 'schools': results}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({k: report[k] for k in ('source_extraction_schools', 'core_slots', 'status_counts', 'publish_ready')}))


if __name__ == '__main__':
    main()
