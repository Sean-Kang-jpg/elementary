"""Grade-1 afternoon time slots from v3 after-school rows: the layer the timetable engine uses.

A slot is (kind, weekday, start, end) for 2026 학기 afternoons:
  맞춤형            every 맞춤형 row grade 1 can take, including those run inside a 돌봄 room
  저학년방과후       방과후 rows whose grade text includes grade 1 and tops out at 3학년 or below
  전학년방과후       방과후 rows open to grade 1 that run up to 4학년 or higher ('1~6학년')
  학년미기재방과후   방과후 rows with no grade written
The last two are drawn hatched on the school card: grade 1 may join, but later sections are
usually for older pupils (2026-10-24: kept in the slot layer so the card does not lose them).
Classes grade 1 cannot take (3~6학년) are left out.
Courses sharing a window are one slot; their names travel along as reference. Rows on the v3
column names (llm_extraction_spec_v3.md), after afterschool_rules.resolve_period_slots.

Measured on 30 Seoul schools (2026-10-24) for 맞춤형 and 저학년방과후: slot accuracy 100% against a
Sonnet blind check and 99.2% (131 of 132) against an Opus re-review, against 96% at the course-row
level. The two hatched kinds were not in that measurement.

school_slots also reports what needs a person: weekdays where 맞춤형 rows exist but none has a
time (or only a span over CUSTOM_SPAN_MAX_MINUTES), the extractor's `conflicts` (the document disagrees with itself), and PDF-only sources,
where weekday-time pairs are the one error the Opus review found.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Iterable

from etl.load_school_afterschool import grade_upper

WEEKDAYS = '월화수목금'
HHMM = re.compile(r'^\d{2}:\d{2}$')
NOON = '12:00'
LOWER_GRADE_MAX = 3


def slot_kind(row: dict) -> str | None:
    if row.get('period') != '학기' or row.get('grade1') == 'false':
        return None
    if row.get('kind') == '맞춤형':
        return '맞춤형'
    if row.get('kind') != '방과후':
        return None
    if row.get('grade1') == 'true':
        upper = grade_upper(row.get('grades_raw'))
        if upper is not None and upper <= LOWER_GRADE_MAX:
            return '저학년방과후'
        return '전학년방과후' if upper is not None else '학년미기재방과후'
    return '학년미기재방과후' if row.get('grade1') == 'unknown' else None


BLOCK_GAP_MINUTES = 10
# A 맞춤형 'window' longer than this is the 돌봄 room's whole programme span ("12:40~15:20 특기적성",
# 백현초 B000003755, 2026-10-28), not a class a parent can plan around: it is dropped and the day is
# a 맞춤형시각없음 check. Real 맞춤형 classes run 40~90 minutes, merged blocks included.
CUSTOM_SPAN_MAX_MINUTES = 120


def _minutes(value: str) -> int:
    hours, mins = value.split(':')
    return int(hours) * 60 + int(mins)


def merge_blocks(rows: Iterable[dict]) -> list[dict]:
    """One programme written as back-to-back 40-minute blocks ("13:00~13:40 | 13:50~14:30") is one window
    for a parent (불정초 B000003756, 2026-10-28: the blind key merged them, the extraction kept three
    blocks). Rows of the same kind, name, section and single weekday whose times follow within
    BLOCK_GAP_MINUTES are joined; anything else passes through."""
    out: list[dict] = []
    indexed = [{**row, '_order': i} for i, row in enumerate(rows)]
    for row in sorted(indexed, key=lambda r: (r.get('kind') or '', r.get('name') or '', r.get('section') or '',
                                              r.get('days') or '', r.get('start') or '')):
        prev = out[-1] if out else None
        timed = HHMM.match(str(row.get('start') or '')) and HHMM.match(str(row.get('end') or ''))
        if (prev and timed and len(row.get('days') or '') == 1 and prev.get('_timed')
                and all(prev.get(k) == row.get(k) for k in ('kind', 'name', 'section', 'days', 'period', 'grade1'))
                and 0 <= _minutes(row['start']) - _minutes(prev['end']) <= BLOCK_GAP_MINUTES):
            prev['end'] = row['end']
            continue
        out.append({**row, '_timed': bool(timed)})
    return sorted(out, key=lambda r: r['_order'])   # keep the document's order for course names


def school_slots(rows: Iterable[dict], conflicts: list | None = None, pdf_only: bool = False) -> dict:
    rows = merge_blocks(rows)
    slots: dict[tuple, dict] = {}
    custom_days_with_rows: set[str] = set()
    for row in rows:
        kind = slot_kind(row)
        if not kind:
            continue
        days = ''.join(d for d in (row.get('days') or '') if d in WEEKDAYS)
        if kind == '맞춤형':
            custom_days_with_rows.update(days or WEEKDAYS)
        start, end = row.get('start'), row.get('end')
        if not days or not (HHMM.match(str(start or '')) and HHMM.match(str(end or ''))) or end <= NOON:
            continue
        if kind == '맞춤형' and _minutes(end) - _minutes(start) > CUSTOM_SPAN_MAX_MINUTES:
            continue
        for day in days:
            slot = slots.setdefault((kind, day, start, end), {
                'kind': kind, 'weekday': day, 'start': start, 'end': end, 'courses': [],
                'place': None, 'time_source': 'plan'})
            if row.get('name') and row['name'] not in slot['courses']:
                slot['courses'].append(row['name'])
            if row.get('place') == '돌봄내':
                slot['place'] = '돌봄내'
            if row.get('time_source') == 'period_slot':
                slot['time_source'] = 'period_slot'
    timed_custom_days = {s['weekday'] for s in slots.values() if s['kind'] == '맞춤형'}
    checks = [['맞춤형시각없음', day, None] for day in WEEKDAYS if day in custom_days_with_rows - timed_custom_days]
    checks += [['원문불일치', c[0] if c else None, c] for c in (conflicts or [])]
    if pdf_only and slots:
        checks.append(['PDF원문', None, None])
    ordered = sorted(slots.values(), key=lambda s: (WEEKDAYS.index(s['weekday']), s['start'], s['kind']))
    status = 'none' if not ordered and not custom_days_with_rows else 'check' if checks else 'ok'
    return {'slots': ordered, 'checks': checks, 'status': status}


def slots_by_weekday(slots: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for slot in slots:
        out[slot['weekday']].append(slot)
    return dict(out)
