"""P2 expansion: propose grade-1 clock values from 15-라 plans for review against the original.

For each pilot school still missing a dismissal estimate, scan the 15-라 text for the patterns the
operating-pilot review found (2026-10-21): a regular-class slot printed with its time
("9:00~12:10 정규수업(1~4교시)", "13:00~13:40 정규수업(5교시)"), a lunch slot, "~12:50 정규수업",
and the 맞춤형 start on 4- and 5-period days ("4교시 수업일 경우 12:50~"). The output holds
proposals plus the evidence lines; a reviewer writes the clock, nothing here is published.

    python -m etl.propose_pivot_school_clocks [--stage N]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from etl.scan_pivot_afterschool_clocks import document_text


ROOT = Path(__file__).resolve().parents[1]
PIVOT = ROOT / 'docs/research/pivot'
T = r'(\d{1,2})\s*[:：;]\s*(\d{2})'
RANGE = re.compile(T + r'\s*[~∼～\-–]\s*' + T)
SIGNAL = re.compile(r'정규|교시|점심|급식|중식|하교|맞춤형|늘봄|수업일|운영\s*시')
P4 = re.compile(r'정규\s*수업\s*\(?\s*(1\s*[~∼～\-]\s*4\s*교시|4\s*교시)')
P5 = re.compile(r'정규\s*수업\s*\(?\s*(5\s*교시|5\s*\))|5\s*교시')
LUNCH = re.compile(r'점심|중식|급식')
REG_END = re.compile(r'[~∼～]\s*' + T + r'\s*\|?\s*정규\s*수업')
START = re.compile(r'([45])\s*교시\s*(?:수업일|운영\s*시|운영일|날|후|이후)?[^0-9]{0,12}' + T + r'\s*[~∼～\-]')


def hm(h: str, m: str) -> str:
    return f'{int(h):02d}:{m}'


def propose(lines: list[str]) -> tuple[dict, list[str]]:
    found: dict[str, set] = {k: set() for k in ('p4', 'lunch', 'p5', 'reg_end', 'start4', 'start5')}
    evidence = []
    for line in lines:
        flat = re.sub(r'\s+', ' ', line)
        if not (RANGE.search(flat) or REG_END.search(flat)) or not SIGNAL.search(flat):
            continue
        hit = False
        for span in RANGE.finditer(flat):
            a, b = hm(span.group(1), span.group(2)), hm(span.group(3), span.group(4))
            if not ('08:00' <= a < b <= '16:00'):
                continue
            near = flat[span.end():span.end() + 40]
            if P4.search(near):
                found['p4'].add((a, b)); hit = True
            elif LUNCH.search(near[:12]):
                found['lunch'].add((a, b)); hit = True
            elif P5.search(near) and '정규' in near:
                found['p5'].add((a, b)); hit = True
        for m in REG_END.finditer(flat):
            found['reg_end'].add(hm(m.group(1), m.group(2))); hit = True
        for m in START.finditer(flat):
            found['start' + m.group(1)].add(hm(m.group(2), m.group(3))); hit = True
        if hit or ('정규' in flat and RANGE.search(flat)):
            evidence.append(flat[:220])
    return {k: sorted(v) for k, v in found.items() if v}, evidence[:8]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--stage', type=int, choices=(1, 2, 3))
    args = parser.parse_args()
    scans = sorted(PIVOT.glob('p2_afterschool_clock_scan_*.json'))
    scan = json.loads(scans[-1].read_text(encoding='utf-8'))['schools']
    reviewed = set()
    for path in PIVOT.glob('p2_school_day_review_*.json'):
        review = json.loads(path.read_text(encoding='utf-8'))
        reviewed |= {s['school_id'] for s in review['schools']} | {s['school_id'] for s in review.get('unresolved', [])}
    rows = []
    for school in scan:
        if school['school_id'] in reviewed or (args.stage and school['stage'] != args.stage):
            continue
        lines, files = [], []
        for f in school['files']:
            if f['status'] == 'missing':
                continue
            text = document_text(f['sha256'], f['format']) or ''
            lines += text.splitlines()
            files.append(f['name'])
        proposal, evidence = propose(lines)
        rows.append({key: school[key] for key in ('school_id', 'school_name', 'area', 'stage')}
                    | {'files': files, 'proposal': proposal, 'evidence': evidence})
    out = PIVOT / f"p2_clock_proposals{'_stage' + str(args.stage) if args.stage else ''}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    kinds = {}
    for r in rows:
        p = r['proposal']
        kind = ('stated' if p.get('p5') and (p.get('lunch') or p.get('reg_end')) else
                'starts' if p.get('start4') or p.get('start5') else
                'partial' if p else 'none')
        kinds[kind] = kinds.get(kind, 0) + 1
    print(len(rows), kinds, f'wrote {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
