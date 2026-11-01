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
# The first two or three weeks of March, when grade 1 leaves after 4교시 ("2026 입학초기 3.3~3.13",
# 낙생초 B000003745, 2026-11-02: 화·목·금 13:00~14:30 sat beside the term's 13:50~15:20). Such a row is
# not the term's timetable. merge_terms joins labels with ' · ', so a row also written for the regular
# term keeps its slot, and "적응기간 이후" (B000003772) or "3월 3주 이후" (B000003752) is the term itself.
# A March-long table ("3월 (1~4주) 및 방학 중", B000001921) is not caught: it may be all the plan gives.
EARLY_TERM = re.compile(r'입학\s*초기|적응기|3월\s*[1-3]\s*~\s*[1-3]\s*주')
AFTER_EARLY = re.compile(r'이후|부터')


def early_term_only(term: str | None) -> bool:
    parts = [t for t in (term or '').split(' · ') if t]
    return bool(parts) and all(EARLY_TERM.search(t) and not AFTER_EARLY.search(t) for t in parts)


def slot_kind(row: dict) -> str | None:
    if row.get('period') != '학기' or row.get('grade1') == 'false' or early_term_only(row.get('term')):
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
# Only class-period blocks (40 minutes, 50 with a short activity) are joined. Two 60-minute classes of one
# course back to back are two sections (광명광성초 큐브 13:00~14:00 and 14:10~15:10, 2026-10-29).
BLOCK_MAX_MINUTES = 50
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
    blocks). Rows of the same kind, name, section, course variant, grade text and single weekday whose
    times follow within BLOCK_GAP_MINUTES are joined; anything else passes through. Grade and variant
    matter when a PDF loses the section letter: 안현초 컴퓨터 B(1~3학년) and C(1~6학년) on Wednesday
    are two classes, not one 13:40~16:30 window (2026-10-29)."""
    out: list[dict] = []
    indexed = [{**row, '_order': i} for i, row in enumerate(rows)]
    for row in sorted(indexed, key=lambda r: (r.get('kind') or '', r.get('name') or '', r.get('section') or '',
                                              r.get('variant') or '', r.get('grades_raw') or '',
                                              r.get('days') or '', r.get('start') or '')):
        prev = out[-1] if out else None
        timed = HHMM.match(str(row.get('start') or '')) and HHMM.match(str(row.get('end') or ''))
        if (prev and timed and len(row.get('days') or '') == 1 and prev.get('_timed')
                and all(prev.get(k) == row.get(k) for k in ('kind', 'name', 'section', 'variant', 'grades_raw', 'days', 'period', 'grade1'))
                and prev['_block'] <= BLOCK_MAX_MINUTES and _minutes(row['end']) - _minutes(row['start']) <= BLOCK_MAX_MINUTES
                and 0 <= _minutes(row['start']) - _minutes(prev['end']) <= BLOCK_GAP_MINUTES):
            prev['end'] = row['end']
            continue
        out.append({**row, '_timed': bool(timed),
                    '_block': _minutes(row['end']) - _minutes(row['start']) if timed else 0})
    return sorted(out, key=lambda r: r['_order'])   # keep the document's order for course names


def school_slots(rows: Iterable[dict], conflicts: list | None = None, pdf_only: bool = False) -> dict:
    rows = list(rows)
    # Early-weeks rows draw nothing. Dropped before merge_blocks, which would join them to a term row and
    # keep one label for both. When grade 1 has only an 적응기간 table (B000003768) its days are checks; when
    # a term table exists, a day missing from it has no 맞춤형 (B000002158 자람기: 화·목·금 are classes).
    early = [r for r in rows if early_term_only(r.get('term'))]
    rows = merge_blocks(r for r in rows if not early_term_only(r.get('term')))
    slots: dict[tuple, dict] = {}
    custom_days_with_rows: set[str] = set()
    if not any(slot_kind(r) == '맞춤형' for r in rows):
        custom_days_with_rows = {d for r in early if slot_kind({**r, 'term': None}) == '맞춤형'
                                 for d in (''.join(x for x in (r.get('days') or '') if x in WEEKDAYS) or WEEKDAYS)}
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
