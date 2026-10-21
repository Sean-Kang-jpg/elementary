"""Blind A/B packets for checking the v3 extraction against what is live (2026-10-20 test, 30 schools).

For each school it writes etl/runtime/llm_extraction/verify_v3/<school_id>.json with two row sets
labelled X and Y in a random order: the live rows (school_afterschool_programs, read with the anon
key) and the v3 rows as the card would use them (기간 학기, 1학년판정 not false). The verifier sees
the same document as the extractor and does not know which set is which. The key is written to
key.json beside the packets.

    python -m etl.v3_verify_packets
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from etl.audit_afterschool_serving import env, fetch

ROOT = Path(__file__).resolve().parents[1]
IDS = ROOT / 'etl/runtime/llm_extraction/batches/v3_test30_ids.txt'
V3 = ROOT / 'etl/runtime/llm_extraction/outputs_v3/test30'
OUT = ROOT / 'etl/runtime/llm_extraction/verify_v3'
COLUMNS_V3 = ['kind', 'name', 'variant', 'section', 'grades_raw', 'grade_source', 'days', 'start', 'end',
              'grade1', 'period', 'term', 'line']
# 2026-10-21: 운영장소 added before the line number (14 columns)
COLUMNS_V3_14 = COLUMNS_V3[:12] + ['place', 'line']


def shown(row: dict) -> list:
    """The fields a parent sees: kind, name (variant), section, grade text, days, start, end."""
    name = f"{row['name']} ({row['variant']})" if row.get('variant') else row['name']
    return [row['kind'], name, row.get('section'), row.get('grades_raw'), row.get('days'), row.get('start'), row.get('end')]


def main() -> None:
    ids = IDS.read_text(encoding='utf-8').split()
    url, key = env()
    live: dict[str, list] = {i: [] for i in ids}
    for r in fetch(url, key, 'school_afterschool_programs',
                   'school_id,seq,kind,name,variant,section,grades_raw,weekdays,start_time,end_time',
                   '&school_id=in.(' + ','.join(ids) + ')&order=school_id,seq'):
        live[r['school_id']].append(shown({**r, 'days': r['weekdays'], 'start': (r['start_time'] or '')[:5] or None,
                                          'end': (r['end_time'] or '')[:5] or None}))
    v3: dict[str, list] = {}
    for path in sorted(V3.glob('batch_*.json')):
        for school in json.loads(path.read_text(encoding='utf-8')):
            rows = [dict(zip(COLUMNS_V3_14 if len(values) == 14 else COLUMNS_V3, values)) for values in school.get('rows', [])]
            v3[school['school_id']] = [shown(r) for r in rows if r.get('period') == '학기' and r.get('grade1') != 'false']
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(20261020)
    answer = {}
    for school_id in ids:
        sets = [('live', live[school_id]), ('v3', v3.get(school_id, []))]
        rng.shuffle(sets)
        answer[school_id] = {'X': sets[0][0], 'Y': sets[1][0]}
        packet = {'school_id': school_id, 'columns': ['종류', '강좌명(과정)', '반', '대상학년원문', '요일', '시작', '종료'],
                  'X': [[i, *row] for i, row in enumerate(sets[0][1], 1)],
                  'Y': [[i, *row] for i, row in enumerate(sets[1][1], 1)]}
        (OUT / f'{school_id}.json').write_text(json.dumps(packet, ensure_ascii=False), encoding='utf-8')
    (OUT / 'key.json').write_text(json.dumps(answer, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({'packets': len(ids), 'live_rows': sum(map(len, live.values())),
                      'v3_rows': sum(map(len, v3.values())), 'v3_schools': len(v3)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
