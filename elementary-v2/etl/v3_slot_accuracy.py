"""Slot-level accuracy of the 30-school v3 test (2026-10-24), from the existing blind verification.

The timetable engine needs, per school and weekday, the time windows grade 1 can use - 맞춤형 and
lower-grade 방과후 (grade text tops out at 3학년) - not the course list. This re-scores the blind A/B
verification (llm_verify_spec_v3.md) at that level, with no new extraction:

  slot     (kind, weekday, start, end) built from a set's shown rows
  wrong    every row behind the slot was marked wrong on days, time, grade or not_target
  missing  the verifier listed a missing 맞춤형 class while the set has no 맞춤형 slot that weekday
           (missing items carry no time, so this is a lower bound)

Name, duplicate and section errors do not touch a slot, and one correct row is enough to carry it.

    python -m etl.v3_slot_accuracy
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from etl.load_school_afterschool import grade_upper

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / 'etl/runtime/llm_extraction/verify_v3'
SLOT_FIELDS = {'days', 'time', 'grade', 'not_target'}
HHMM = re.compile(r'^\d{2}:\d{2}$')


def slots(rows: list) -> dict[tuple, set]:
    """slot -> row numbers behind it. Rows: [no, kind, name, section, grades_raw, days, start, end]."""
    out: dict[tuple, set] = defaultdict(set)
    for no, kind, _name, _section, grades, days, start, end in rows:
        if not days or not (HHMM.match(str(start or '')) and HHMM.match(str(end or ''))):
            continue
        if kind == '방과후':
            upper = grade_upper(grades)
            if upper is None or upper > 3:
                continue
        for day in days:
            if day in '월화수목금':
                out[(kind, day, start, end)].add(no)
    return out


def main() -> None:
    key = json.loads((VERIFY / 'key.json').read_text(encoding='utf-8'))
    results = {}
    for path in sorted(VERIFY.glob('result_t*.json')):
        for school in json.loads(path.read_text(encoding='utf-8')):
            results[school['school_id']] = school
    total = {name: defaultdict(int) for name in ('live', 'v3')}
    per_school = {}
    for school_id, labels in key.items():
        packet = json.loads((VERIFY / f'{school_id}.json').read_text(encoding='utf-8'))
        result = results.get(school_id) or {}
        per_school[school_id] = {}
        for label, name in labels.items():
            judged = result.get(label) or {}
            bad_rows = {w[0] for w in judged.get('wrong', []) if w[1] in SLOT_FIELDS}
            built = slots(packet[label])
            wrong = [s for s, rows in built.items() if rows <= bad_rows]
            custom_days = {s[1] for s in built if s[0] == '맞춤형' and s not in wrong}
            missing_custom = sum(1 for m in judged.get('missing', []) if m and m[0] == '맞춤형')
            missing = 0 if not missing_custom else 5 - len(custom_days)
            t = total[name]
            t['slots'] += len(built)
            t['wrong'] += len(wrong)
            t['missing_lower_bound'] += max(missing, 0)
            t['schools'] += 1
            t['schools_all_slots_right'] += int(not wrong and missing <= 0)
            per_school[school_id][name] = {'slots': len(built), 'wrong': len(wrong), 'missing': max(missing, 0)}
    report = {}
    for name, t in total.items():
        report[name] = {**t, 'slot_accuracy': round(1 - t['wrong'] / t['slots'], 3) if t['slots'] else None}
    counts = sorted(s['v3']['slots'] for s in per_school.values())
    report['v3_slots_per_school'] = {'median': counts[len(counts) // 2], 'max': counts[-1]}
    print(json.dumps(report, ensure_ascii=False, indent=1))
    for school_id, s in sorted(per_school.items()):
        if s['v3']['wrong'] or s['v3']['missing'] or s['live']['wrong'] or s['live']['missing']:
            print(school_id, 'live', s['live'], 'v3', s['v3'])


if __name__ == '__main__':
    main()
