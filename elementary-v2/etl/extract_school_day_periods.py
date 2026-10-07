"""E04-c2b: period clock candidates from detected 시정표, plus an estimated grade-1 하교 per weekday.

Inputs (all produced earlier, read-only):
  docs/research/audit2/schoolinfo_daily_clock_audit_20261006.json  which file has a clock
  etl/runtime/audit2-documents/text/<sha>.txt                      extracted text
  docs/research/audit2/neis_grade1_periods_20261007.json           grade-1 periods per weekday

Rules, deliberately conservative — anything they cannot settle is flagged, never guessed:
  * Only the first variant of a detected clock is read; a repeated period number starts a new
    variant (seasonal or grade-band tables) and is counted, not merged.
  * A row naming two periods ("2블록 (3교시-4교시)") is the whole block when it lasts 70+ minutes
    and only the first period when it lasts about 40.
  * A 4-period day ends after lunch when lunch follows 4교시 (급식 후 하교); this is an assumption
    the card must state, and it is flagged when lunch does not follow 4교시.
  * NEIS weekday periods come from the 1학기 regular window, else the 2학기 window; a weekday whose
    mode covers under 80% of observations is left unknown.

    python -m etl.extract_school_day_periods
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import clock_blocks, clock_rows

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'docs/research/audit2/schoolinfo_daily_clock_audit_20261006.json'
NEIS = ROOT / 'docs/research/audit2/neis_grade1_periods_20261007.json'
TEXT = ROOT / 'etl/runtime/audit2-documents/text'
OUT = ROOT / 'docs/research/audit2/school_day_periods_candidates_20261007.json'
WEEKDAYS = ['월', '화', '수', '목', '금']
PERIOD_PAIR = re.compile(r'([1-7])\s*(?:교\s*시)?\s*[-~,·]\s*([1-7])\s*교\s*시')


def minutes(hhmm: str) -> int:
    hours, mins = hhmm.split(':')
    return int(hours) * 60 + int(mins)


def period_clock(rows: list[dict], lines: list[str]) -> dict:
    """First-variant period -> (start, end), lunch, and how many variants were seen."""
    periods: dict[int, dict] = {}
    lunch = None
    variants = 1
    inferred: list[int] = []
    for row in rows:
        text = lines[row['line'] - 1]
        if row['label'] == '점심':
            if lunch is None:
                lunch = {'start': row['start'], 'end': row['end']}
            continue
        number = re.match(r'([1-7])(교시|블록|블럭)$', row['label'])
        pair = PERIOD_PAIR.search(text)
        duration = minutes(row['end']) - minutes(row['start'])
        first = None
        if pair:
            first, last = int(pair.group(1)), int(pair.group(2))
            target = last if duration >= 70 else first
            first = first if duration >= 70 else None
        elif number and number.group(2) == '교시':
            target = int(number.group(1))
        elif number:  # "3블럭 12:50-14:10": block N covers periods 2N-1 and 2N
            block = int(number.group(1))
            first, target = 2 * block - 1, 2 * block
            if duration < 70:
                target, first = first, None
        else:
            continue
        value = {'start': row['start'], 'end': row['end']}
        if target in periods:
            if periods[target] == value:  # the same row repeated for each weekday column
                continue
            variants += 1
            break
        periods[target] = value
        if first is not None and first not in periods and duration == 80:
            # an 80-minute block with no inner break: its first period ends 40 minutes in
            end = minutes(row['start']) + 40
            periods[first] = {'start': row['start'], 'end': f'{end // 60:02d}:{end % 60:02d}'}
            inferred.append(first)
    return {'periods': dict(sorted(periods.items())), 'lunch': lunch, 'variants_seen': variants, 'inferred_periods': inferred}


def weekday_periods(neis_school: dict) -> tuple[dict, str | None]:
    """Each weekday from the first window that settles it (share >= 0.8), in window order."""
    result: dict = {day: None for day in WEEKDAYS}
    used = []
    for window in ('term1_regular', 'term2_regular', 'term2_early'):
        data = neis_school.get('windows', {}).get(window, {})
        if data.get('status') != 'ok' or not data.get('class_count'):
            continue
        for day in WEEKDAYS:
            cell = data['weekdays'].get(day)
            if result[day] is None and cell and cell['share'] >= 0.8:
                result[day] = cell['mode']
                if window not in used:
                    used.append(window)
    return result, '+'.join(used) or None


def dismissal(clock: dict, count: int | None) -> tuple[str | None, str | None]:
    """Estimated end of the school day for a weekday with `count` periods, and the rule used."""
    if count is None:
        return None, None
    periods, lunch = clock['periods'], clock['lunch']
    end = periods.get(count, {}).get('end')
    if not end:
        return None, None
    if lunch and minutes(lunch['start']) >= minutes(end) - 5 and minutes(lunch['start']) - minutes(end) <= 15:
        return lunch['end'], 'after_lunch'  # 마지막 교시 직후 점심이면 급식 후 하교
    return end, 'period_end'


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding='utf-8'))
    neis = {s['school_id']: s for s in json.loads(NEIS.read_text(encoding='utf-8'))['schools']}
    schools = []
    for school in audit['schools']:
        record = {'school_id': school['school_id'], 'school_name': school['school_name'], 'region': school['region'],
                  'clock_status': school['status'], 'review_flags': []}
        week, window = weekday_periods(neis.get(school['school_id'], {}))
        record['grade1_weekday_periods'] = week
        record['periods_source'] = f'NEIS {window}' if window else None
        source = next((f for f in school['files'] if f['status'] == 'clock_found'), None)
        if source:
            lines = (TEXT / f"{source['sha256']}.txt").read_text(encoding='utf-8').splitlines()
            blocks = clock_blocks(clock_rows('\n'.join(lines)))
            clock = period_clock(blocks[0], lines)
            record.update({'clock_file': source['name'], 'clock_sha256': source['sha256'], 'clock': clock})
            if clock['variants_seen'] > 1 or len(blocks) > 1:
                record['review_flags'].append('multiple_tables')
            for needed in (4, 5):
                if needed not in clock['periods']:
                    record['review_flags'].append(f'missing_period_{needed}')
            if not clock['lunch']:
                record['review_flags'].append('missing_lunch')
            elif 4 in clock['periods'] and minutes(clock['lunch']['start']) < minutes(clock['periods'][4]['end']) - 5:
                record['review_flags'].append('lunch_before_period4_end')
            ends = sorted(v['end'] for v in clock['periods'].values())
            if ends != [clock['periods'][k]['end'] for k in sorted(clock['periods'])]:
                record['review_flags'].append('period_order')
            estimate = {}
            for day in WEEKDAYS:
                end, rule = dismissal(clock, week[day])
                estimate[day] = {'periods': week[day], 'dismissal': end, 'rule': rule}
            record['estimated_dismissal'] = estimate
            if any(v['dismissal'] is None for v in estimate.values()):
                record['review_flags'].append('dismissal_incomplete')
        record['status'] = ('no_clock' if not source else 'needs_review' if record['review_flags'] else 'candidate')
        schools.append(record)
    summary: dict[str, int] = {}
    for record in schools:
        summary[record['status']] = summary.get(record['status'], 0) + 1
    OUT.write_text(json.dumps({'schema_version': 'school-day-periods-candidates-v1', 'evidence_state': 'estimated_from_2026_sources_not_reviewed',
                               'publish_status': 'not_approved', 'no_operational_upload': True, 'summary': summary, 'schools': schools},
                              ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
