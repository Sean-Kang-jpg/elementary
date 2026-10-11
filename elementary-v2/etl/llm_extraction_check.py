"""E05/E06: validate LLM extractions and score them against the reviewed sets.

Validation (no reference to reviewed values) decides auto-accept:
  * every evidence string occurs in the school's input excerpt (whitespace-normalised) and
    contains the time it supports
  * times are HH:MM; lunch lasts 30-80 minutes; 4교시 ends before 5교시
  * after_p4: lunch starts within -5..+15 minutes of 4교시 end; before_p4: lunch ends by 4교시 end
  * care: extended_end later than afternoon_end; afternoon_end between 14:00 and 20:30
Scoring compares the extracted fields with the reviewed, user-confirmed values (pilot +
expansion) and reports accuracy for all and for auto-accepted schools, per field.

    python -m etl.llm_extraction_check --outputs etl/runtime/llm_extraction/outputs/haiku
    python -m etl.llm_extraction_check --outputs ... --corrections docs/research/audit2/care_review_corrections_20261009.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
INPUTS = ROOT / 'etl/runtime/llm_extraction/inputs'
CLOCK_GOLD = ['school_day_review_first_pass_20261007.json', 'school_day_review_expansion_20261008.json']
CARE_GOLD = ['care_review_first_pass_20261007.json', 'care_review_expansion_20261008.json']
HHMM = re.compile(r'^\d{2}:\d{2}$')


def minutes(value: str) -> int:
    hours, mins = value.split(':')
    return int(hours) * 60 + int(mins)


def squash(text: str) -> str:
    """Compare quotes ignoring whitespace and table-cell separators, which extractors add or drop."""
    return re.sub(r'[\s|]+', '', text)


def time_in(evidence: str, value: str) -> bool:
    """'13:40' should appear in the evidence, allowing '13 : 40', a dropped leading zero, and PDF text
    that runs a range together ('11:3012:10' holds 11:30 and 12:10)."""
    h, m = value.split(':')
    found = re.finditer(r'(\d{1,2})\s*:\s*(\d{2})', evidence)
    return any(int(fh) == int(h) and fm == m for fh, fm in (match.groups() for match in found))


def check_clock(clock: dict, source: str) -> list[str]:
    if not clock or not clock.get('found'):
        return []
    problems = []
    fields = ('p4_end', 'lunch_start', 'lunch_end', 'p5_end')
    for name in fields:
        if not isinstance(clock.get(name), str) or not HHMM.match(clock[name]):
            problems.append(f'clock.{name} not HH:MM')
    if problems:
        return problems
    evidence = clock.get('evidence') or {}
    for key, value in (('p4', clock['p4_end']), ('lunch', clock['lunch_end']), ('p5', clock['p5_end'])):
        text = evidence.get(key) or ''
        if not text or squash(text) not in squash(source):
            problems.append(f'clock.evidence.{key} not in source')
        elif not (key == 'p5' and clock.get('p5_end_inferred')) and not time_in(text, value):
            problems.append(f'clock.evidence.{key} lacks {value}')
    p4, ls, le, p5 = (minutes(clock[n]) for n in fields)
    if not 30 <= le - ls <= 80:
        problems.append('lunch length')
    if not p4 < p5:
        problems.append('p4 not before p5')
    # a 5교시 *end* lies a period after lunch (after_p4) or after 4교시 (before_p4); a start time slips in otherwise
    if clock.get('lunch_position') == 'after_p4' and not 30 <= p5 - le <= 60:
        problems.append('p5_end not one period after lunch')
    if clock.get('lunch_position') == 'before_p4' and not 30 <= p5 - p4 <= 60:
        problems.append('p5_end not one period after 4교시')
    if clock.get('lunch_position') == 'after_p4' and not -5 <= ls - p4 <= 15:
        problems.append('after_p4 but lunch not right after 4교시')
    if clock.get('lunch_position') == 'before_p4' and not le <= p4:
        problems.append('before_p4 but lunch ends after 4교시')
    if clock.get('lunch_position') not in ('after_p4', 'before_p4'):
        problems.append('lunch_position')
    return problems


def check_care(care: dict, source: str) -> list[str]:
    if not care or care.get('status') != 'stated':
        return []
    problems = []
    end = care.get('afternoon_end')
    if not isinstance(end, str) or not HHMM.match(end):
        return ['care.afternoon_end not HH:MM']
    if not '14:00' <= end <= '20:30':
        problems.append('care.afternoon_end out of range')
    evidence = care.get('evidence') or ''
    if not evidence or squash(evidence) not in squash(source):
        problems.append('care.evidence not in source')
    # '17시' or, in prose, '5시까지'
    elif not time_in(evidence, end) and not re.search(rf'(?<!\d)(?:{int(end[:2])}|{int(end[:2]) - 12})\s*시', evidence):
        problems.append(f'care.evidence lacks {end}')
    ext = care.get('extended_end')
    if ext and (not HHMM.match(ext) or ext <= end):
        problems.append('care.extended_end not after afternoon_end')
    return problems


def load_gold(corrections: Path | None = None) -> tuple[dict, dict]:
    """Reviewed values; `corrections` (an adjudication file) overrides them school by school."""
    clock, care = {}, {}
    for name in CLOCK_GOLD:
        data = json.loads((AUDIT2 / name).read_text(encoding='utf-8'))
        for s in data['schools']:
            clock[s['school_id']] = {'found': True, 'p4_end': s['p4_end'], 'lunch_start': s['lunch'][0], 'lunch_end': s['lunch'][1],
                                     'lunch_position': s['lunch_position'], 'p5_end': s['p5_end']}
        for s in data.get('excluded_no_regular_clock', []):
            clock[s['school_id']] = {'found': False}
    for name in CARE_GOLD:
        for s in json.loads((AUDIT2 / name).read_text(encoding='utf-8'))['schools']:
            care[s['school_id']] = ({'status': 'unknown'} if s.get('unknown') else
                                    {'status': 'stated', 'afternoon_end': s['afternoon_end'], 'extended_end': s.get('extended_end')})
    if corrections:
        data = json.loads(corrections.read_text(encoding='utf-8'))
        for c in data.get('corrections', []):
            after = c['after']
            care[c['school_id']] = ({'status': 'unknown'} if after == 'unknown' else
                                    {'status': 'stated', 'afternoon_end': after['afternoon_end'], 'extended_end': after.get('extended_end')})
        for c in data.get('clock_corrections', []):
            a = c['after']
            clock[c['school_id']] = {'found': True, 'p4_end': a['p4_end'], 'lunch_start': a['lunch'][0], 'lunch_end': a['lunch'][1],
                                     'lunch_position': a['lunch_position'], 'p5_end': a['p5_end']}
    return clock, care


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--outputs', required=True, help='directory of batch JSON files (each a list of school objects)')
    parser.add_argument('--corrections', help='adjudication file applied on top of the reviewed sets')
    args = parser.parse_args()
    extracted = {}
    for file in sorted(p for p in Path(args.outputs).glob('*.json') if not p.name.startswith('_')):
        for row in json.loads(file.read_text(encoding='utf-8')):
            extracted[row['school_id']] = row
    gold_clock, gold_care = load_gold(Path(args.corrections) if args.corrections else None)
    report = {'schools_extracted': len(extracted), 'clock': {}, 'care': {}, 'disagreements': []}
    clock_fields = ('p4_end', 'lunch_start', 'lunch_end', 'lunch_position', 'p5_end')

    def tally(kind: str, sid: str, ok: bool, accepted: bool) -> None:
        bucket = report[kind]
        for key, cond in (('total', True), ('correct', ok), ('accepted', accepted), ('accepted_correct', accepted and ok)):
            bucket[key] = bucket.get(key, 0) + (1 if cond else 0)

    for sid, row in extracted.items():
        source = (INPUTS / f'{sid}.txt').read_text(encoding='utf-8')
        clock_problems = check_clock(row.get('clock') or {}, source)
        care_problems = check_care(row.get('care') or {}, source)
        row['_problems'] = clock_problems + care_problems
        if sid in gold_clock:
            gold, got = gold_clock[sid], row.get('clock') or {}
            if not gold['found']:
                ok = not got.get('found')
            else:
                ok = bool(got.get('found')) and all(got.get(f) == gold[f] for f in clock_fields)
            tally('clock', sid, ok, not clock_problems and bool(got.get('found')) == gold['found'])
            if not ok:
                report['disagreements'].append({'school_id': sid, 'kind': 'clock', 'accepted': not clock_problems,
                                                'got': {f: got.get(f) for f in ('found',) + clock_fields}, 'gold': gold})
        if sid in gold_care:
            gold, got = gold_care[sid], row.get('care') or {}
            ok = got.get('status') == gold['status'] and (gold['status'] == 'unknown' or (
                got.get('afternoon_end') == gold['afternoon_end'] and (got.get('extended_end') or None) == (gold.get('extended_end') or None)))
            tally('care', sid, ok, not care_problems)
            if not ok:
                report['disagreements'].append({'school_id': sid, 'kind': 'care', 'accepted': not care_problems,
                                                'got': {k: got.get(k) for k in ('status', 'afternoon_end', 'extended_end')}, 'gold': gold})
    for kind in ('clock', 'care'):
        b = report[kind]
        if b.get('total'):
            b['accuracy'] = round(b['correct'] / b['total'], 3)
            b['accept_rate'] = round(b['accepted'] / b['total'], 3)
            b['accepted_accuracy'] = round(b['accepted_correct'] / b['accepted'], 3) if b['accepted'] else None
    out = Path(args.outputs) / ('_report_corrected.json' if args.corrections else '_report.json')
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('schools_extracted', 'clock', 'care')}, ensure_ascii=False, indent=2))
    print('disagreements:', len(report['disagreements']), '->', out)


if __name__ == '__main__':
    main()
