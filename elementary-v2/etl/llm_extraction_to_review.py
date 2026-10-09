"""E05: turn validated LLM extractions into review files the loader already understands.

Each school's clock and care are taken when the validator accepts them; anything it rejects goes
to `pending` and is filled only from `--overrides` (values an assistant or person read from the
source). A seeded sample of accepted schools is listed for a spot check against the source.

    python -m etl.llm_extraction_to_review --set wave2_seoul --outputs etl/runtime/llm_extraction/outputs/wave2_seoul \
        [--overrides docs/research/audit2/llm_review_overrides_wave2_seoul_20261009.json]
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import date
from pathlib import Path

from etl.llm_extraction_check import INPUTS, check_care, check_clock

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
SAMPLE_RATE = 0.10


def clock_entry(school_id: str, name: str, clock: dict) -> dict:
    entry = {'school_id': school_id, 'school_name': name, 'p4_end': clock['p4_end'], 'lunch': [clock['lunch_start'], clock['lunch_end']],
             'lunch_position': clock['lunch_position'], 'p5_end': clock['p5_end'], 'doc_periods': None,
             'confidence': 'llm_validated', 'note': clock.get('note'), 'evidence': clock.get('evidence')}
    if clock.get('p5_end_inferred'):
        entry['inferred'] = ['p5_end']
    return entry


def care_entry(school_id: str, name: str, care: dict) -> dict:
    if care.get('status') != 'stated':
        return {'school_id': school_id, 'school_name': name, 'unknown': True, 'note': care.get('note'), 'confidence': 'llm_validated'}
    return {'school_id': school_id, 'school_name': name, **{k: care.get(k) for k in (
        'afternoon_end', 'extended_end', 'extended_condition', 'morning', 'grades', 'evidence')}, 'confidence': 'llm_validated'}


def build(rows: dict[str, dict], overrides: dict, seed: int = 20261009) -> dict:
    clock_schools, care_schools, pending, accepted_ids = [], [], [], []
    for school_id, row in sorted(rows.items()):
        source = (INPUTS / f'{school_id}.txt').read_text(encoding='utf-8')
        name = source.splitlines()[1].split(': ', 1)[1]
        override = overrides.get(school_id, {})
        clock, care = row.get('clock') or {}, row.get('care') or {}
        clock_problems, care_problems = check_clock(clock, source), check_care(care, source)
        if 'clock' in override:
            if override['clock']:
                clock_schools.append({**clock_entry(school_id, name, override['clock']), 'confidence': 'source_checked'})
        elif clock_problems:
            pending.append({'school_id': school_id, 'school_name': name, 'kind': 'clock', 'problems': clock_problems})
        elif clock.get('found'):
            clock_schools.append(clock_entry(school_id, name, clock))
        if 'care' in override:
            care_schools.append({**care_entry(school_id, name, override['care']), 'confidence': 'source_checked'})
        elif care_problems:
            pending.append({'school_id': school_id, 'school_name': name, 'kind': 'care', 'problems': care_problems})
        else:
            care_schools.append(care_entry(school_id, name, care))
        if not clock_problems and not care_problems and not override:
            accepted_ids.append(school_id)
    sample = sorted(random.Random(seed).sample(accepted_ids, max(1, round(len(accepted_ids) * SAMPLE_RATE)))) if accepted_ids else []
    return {'clock': clock_schools, 'care': care_schools, 'pending': pending, 'spot_check_sample': sample}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--set', required=True, help='name used in the output files, e.g. wave2_seoul')
    parser.add_argument('--outputs', required=True)
    parser.add_argument('--overrides')
    parser.add_argument('--stamp', default=date.today().strftime('%Y%m%d'))
    args = parser.parse_args()
    rows = {}
    for file in sorted(p for p in Path(args.outputs).glob('*.json') if not p.name.startswith('_')):
        for row in json.loads(file.read_text(encoding='utf-8')):
            rows[row['school_id']] = row
    overrides = json.loads(Path(args.overrides).read_text(encoding='utf-8'))['schools'] if args.overrides else {}
    result = build(rows, overrides)
    reviewer = 'sonnet extraction + validator (etl/llm_extraction_check.py); rejected items read from source'
    common = {'schema_version': 1, 'reviewed_at': date.today().isoformat(), 'reviewer': reviewer, 'source': 'etl/llm_extraction_spec.md'}
    (AUDIT2 / f'school_day_review_{args.set}_{args.stamp}.json').write_text(json.dumps(
        {**common, 'excluded_no_regular_clock': [], 'schools': result['clock']}, ensure_ascii=False, indent=1), encoding='utf-8')
    (AUDIT2 / f'care_review_{args.set}_{args.stamp}.json').write_text(json.dumps(
        {**common, 'schools': result['care']}, ensure_ascii=False, indent=1), encoding='utf-8')
    (AUDIT2 / f'llm_review_queue_{args.set}_{args.stamp}.json').write_text(json.dumps(
        {'pending': result['pending'], 'spot_check_sample': result['spot_check_sample']}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({'schools': len(rows), 'clock': len(result['clock']), 'care': len(result['care']),
                      'care_stated': sum(not c.get('unknown') for c in result['care']), 'pending': len(result['pending']),
                      'spot_check_sample': len(result['spot_check_sample'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
