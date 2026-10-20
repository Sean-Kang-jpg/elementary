"""Score the blind A/B verification (llm_verify_spec_v3.md) once the key is opened.

Per set (live, v3): rows shown, rows the verifier marked wrong (by field), courses it found missing,
and two rates against the verifier's own answer list:
  row accuracy  = rows not marked wrong / rows
  coverage      = (answer size - missing) / answer size

The verifier is another Sonnet pass, not a person, so the rates measure agreement with an
independent reading of the same document, not ground truth.

    python -m etl.v3_verify_score
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / 'etl/runtime/llm_extraction/verify_v3'


def main() -> None:
    key = json.loads((VERIFY / 'key.json').read_text(encoding='utf-8'))
    results = {}
    for path in sorted(VERIFY.glob('result_t*.json')):
        for school in json.loads(path.read_text(encoding='utf-8')):
            results[school['school_id']] = school
    totals = {name: Counter() for name in ('live', 'v3')}
    fields = {name: Counter() for name in ('live', 'v3')}
    per_school = defaultdict(dict)
    for school_id, labels in key.items():
        result = results.get(school_id)
        if not result:
            continue
        packet = json.loads((VERIFY / f'{school_id}.json').read_text(encoding='utf-8'))
        for label, name in labels.items():
            rows = len(packet[label])
            judged = result.get(label) or {}
            wrong_rows = {w[0] for w in judged.get('wrong', [])}
            missing = len(judged.get('missing', []))
            for w in judged.get('wrong', []):
                fields[name][w[1]] += 1
            totals[name].update({'rows': rows, 'wrong_rows': len(wrong_rows), 'missing': missing,
                                 'answer': result.get('answer_size') or 0, 'schools': 1})
            per_school[school_id][name] = {'rows': rows, 'wrong': len(wrong_rows), 'missing': missing}
        per_school[school_id]['answer'] = result.get('answer_size')
    report = {'schools_scored': len(per_school)}
    for name, t in totals.items():
        report[name] = {**t, 'row_accuracy': round(1 - t['wrong_rows'] / t['rows'], 3) if t['rows'] else None,
                        'coverage': round(1 - t['missing'] / t['answer'], 3) if t['answer'] else None,
                        'wrong_by_field': dict(fields[name].most_common())}
    report['schools_v3_better'] = sum(1 for s in per_school.values() if 'v3' in s and
                                      s['v3']['wrong'] + s['v3']['missing'] < s['live']['wrong'] + s['live']['missing'])
    report['schools_live_better'] = sum(1 for s in per_school.values() if 'v3' in s and
                                        s['v3']['wrong'] + s['v3']['missing'] > s['live']['wrong'] + s['live']['missing'])
    print(json.dumps(report, ensure_ascii=False, indent=1))
    (VERIFY / 'score.json').write_text(json.dumps({'report': report, 'per_school': per_school}, ensure_ascii=False, indent=1),
                                       encoding='utf-8')


if __name__ == '__main__':
    main()
