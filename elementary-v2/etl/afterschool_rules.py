"""Code rules applied to v3 after-school rows before loading (no re-extraction needed).

Rows are dicts with the v3 column names (llm_extraction_spec_v3.md): kind, name, variant, section,
grades_raw, grade_source, days, start, end, grade1, period, term, place, line.

resolve_period_slots
    Some plans give 맞춤형 times only by condition - "4교시 후 13:00~14:20, 5교시 후 13:50~15:10"
    (위례고운초 B000024240, 2026-10-21 P1 test) - and leave which weekday is which to the school's
    timetable. The extractor writes those conditions once per school as `period_slots` and leaves
    the row times empty. Here each weekday gets the slot for grade 1's period count that day, read
    from the published day estimate (SQL 26). A row spanning days whose slots differ is split into
    one row per weekday. Filled times are marked time_source='period_slot': they rest on the day
    estimate, so they are an estimate too.

merge_terms
    Plans that run 방과후 in 기수 print a table per 기수, and the same class (same name, section,
    days, times, grade) appears in each (구산초 B000001888: 꾸러기 A·B in 1기 and 3기). For a parent
    that is one class; the rows are merged and the terms joined ("2026 1기 · 2026 3기"). A class whose
    times change between 기수 stays as separate rows.
"""
from __future__ import annotations

from typing import Iterable
import re

WEEKDAYS = '월화수목금'
MERGE_KEY = ('kind', 'name', 'variant', 'section', 'grades_raw', 'days', 'start', 'end', 'grade1', 'period', 'place', 'time_source')


def resolve_period_slots(rows: Iterable[dict], slots: dict, periods: dict[str, int]) -> list[dict]:
    """slots: {'4': ['13:00', '14:20'], '5': ['13:50', '15:10']}; periods: {'월': 5, '수': 4, ...}."""
    by_period = {int(k): v for k, v in (slots or {}).items() if v and len(v) == 2}
    out: list[dict] = []
    for row in rows:
        # Grade-1 regular periods cannot determine paid-course or grade-2/mixed-grade times.
        grades = re.findall(r'[1-6]', str(row.get('grades_raw') or ''))
        eligible = (row.get('kind') == '맞춤형' and row.get('grade1') == 'true'
                    and row.get('period') == '학기' and grades and set(grades) == {'1'})
        if not eligible or row.get('start') or row.get('end') or not row.get('days') or not by_period:
            out.append(row)
            continue
        filled = []
        for day in row['days']:
            slot = by_period.get(periods.get(day))
            filled.append((day, slot))
        if any(slot is None for _, slot in filled):
            out.append(row)          # a weekday without a known period count stays untimed
            continue
        groups: dict[tuple, str] = {}
        for day, slot in filled:
            groups[tuple(slot)] = groups.get(tuple(slot), '') + day
        for (start, end), days in groups.items():
            out.append({**row, 'days': days, 'start': start, 'end': end, 'time_source': 'period_slot'})
    return out


def merge_terms(rows: Iterable[dict]) -> list[dict]:
    merged: dict[tuple, dict] = {}
    order: list[tuple] = []
    for row in rows:
        key = tuple(row.get(k) for k in MERGE_KEY)
        if key not in merged:
            merged[key] = {**row}
            order.append(key)
            continue
        kept = merged[key]
        terms = [t for t in (kept.get('term') or '').split(' · ') if t]
        if row.get('term') and row['term'] not in terms:
            terms.append(row['term'])
        kept['term'] = ' · '.join(terms) or None
    return [merged[k] for k in order]
