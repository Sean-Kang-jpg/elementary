"""Turn a reviewer's readings module (etl/pivot_review_*.py) into a school-day review JSON.

    python -m etl.write_pivot_review etl.pivot_review_stage1_20261021 docs/research/pivot/p2_school_day_review_stage1_20261021.json
"""
from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = '학교알리미 15-라 방과후·돌봄 운영 계획 2026년 5월 공시(초1~2 맞춤형·돌봄 시간표)'


def main() -> None:
    module, out = importlib.import_module(sys.argv[1]), Path(sys.argv[2])
    names = {e['school_id']: e['school_name'] for e in
             json.loads(sorted((ROOT / 'docs/research/pivot').glob('pilot_manifest_*.json'))[-1].read_text(encoding='utf-8'))['schools']}
    schools = []
    for sid, p4, l0, l1, position, p5, doc, confidence, inferred, evidence in module.READINGS:
        schools.append({'school_id': sid, 'school_name': names[sid], 'p4_end': p4, 'lunch': [l0, l1], 'lunch_position': position,
                        'p5_end': p5, 'doc_periods': doc, 'confidence': confidence, 'inferred': inferred,
                        'note': evidence, 'evidence': {'source': SOURCE, 'text': evidence}})
    review = {'schema_version': 'school-day-review-v1', 'reviewed_at': '2026-10-21',
              'reviewer': 'assistant from original 15-라 plans; user approved the 15-라 method and start-time rule 2026-10-21',
              'source': SOURCE, 'method': (module.__doc__ or '').strip(), 'schools': schools,
              'unresolved': [{'school_id': sid, 'school_name': names[sid], 'reason': 'no_clock', 'note': note}
                             for sid, note in module.UNRESOLVED.items()]}
    out.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{out}: {len(schools)} schools, {len(review["unresolved"])} unresolved')


if __name__ == '__main__':
    main()
