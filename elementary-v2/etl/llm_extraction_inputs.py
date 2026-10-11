"""E05: per-school source excerpts for LLM extraction (no reviewed values in them).

For each school in the given audits it writes etl/runtime/llm_extraction/inputs/<school_id>.txt with
  [CLOCK] the detected 시정표 window (full lines, around every detected clock block)
  [CARE]  돌봄 passages from the 15-라 plan (lines with care + time, and flattened-text matches)
The extractor reads only these files, so evaluation against the reviewed sets stays blind.

    python -m etl.llm_extraction_inputs --set pilot --set expansion
    python -m etl.llm_extraction_inputs --set wave2_seoul --batch-size 26
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import clock_blocks, clock_rows

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
TEXT = ROOT / 'etl/runtime/audit2-documents/text'
OUT = ROOT / 'etl/runtime/llm_extraction/inputs'
SETS = {
    'pilot': ('schoolinfo_daily_clock_audit_20261006.json', 'schoolinfo_care_plan_audit_20261007.json'),
    'expansion': ('schoolinfo_daily_clock_audit_expansion_20261008.json', 'schoolinfo_care_plan_audit_expansion_20261008.json'),
    'wave2_seoul': ('schoolinfo_daily_clock_audit_wave2_seoul_20261009.json', 'schoolinfo_care_plan_audit_wave2_seoul_20261009.json'),
}
BATCHES = ROOT / 'etl/runtime/llm_extraction/batches'
CARE_PHRASE = re.compile(r'(오후\s*돌봄|저녁\s*돌봄|아침\s*돌봄|돌봄\s*교실|돌봄|늘봄)')
TIME = re.compile(r'\d{1,2}\s*:\s*\d{2}|(?:1[6-9]|20)\s*시')


def clock_excerpt(text: str, max_chars: int = 9000) -> str:
    lines = text.splitlines()
    blocks = clock_blocks(clock_rows(text))
    parts, seen = [], set()
    for block in blocks[:3]:
        start, end = max(1, block[0]['line'] - 6), min(len(lines), block[-1]['line'] + 6)
        if (start, end) in seen:
            continue
        seen.add((start, end))
        parts.append('\n'.join(re.sub(r'[ \t]+', ' ', l)[:1500] for l in lines[start - 1:end]))
    return '\n----\n'.join(parts)[:max_chars]


PERIOD = re.compile(r'[1-6]\s*교\s*시')
SCHOOL_HOURS = re.compile(r'(?<!\d)(0?[89]|1[0-5])\s*:\s*\d{2}')


def fallback_clock_excerpt(text: str, max_chars: int = 6000) -> str:
    """When the detector found no 시정표: 400-char windows holding two 교시 labels and four school-hour times."""
    flat = re.sub(r'\s+', ' ', text)
    parts, last_end = [], -1
    for match in PERIOD.finditer(flat):
        if match.start() < last_end:
            continue
        window = flat[match.start():match.start() + 400]
        if len(PERIOD.findall(window)) >= 2 and len(SCHOOL_HOURS.findall(window)) >= 4:
            start = max(0, match.start() - 200)
            parts.append(flat[start:match.start() + 600])
            last_end = match.start() + 600
    return '\n----\n'.join(parts)[:max_chars]


def care_excerpt(text: str, max_chars: int = 5000) -> str:
    flat = re.sub(r'\s+', ' ', text)
    snippets = []
    for match in CARE_PHRASE.finditer(flat):
        window = flat[max(0, match.start() - 80):match.end() + 220]
        if TIME.search(window) and not any(window[80:160] in s for s in snippets):
            snippets.append(window)
        if sum(len(s) for s in snippets) > max_chars:
            break
    return '\n'.join(f'- {s}' for s in snippets)[:max_chars]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--set', action='append', choices=sorted(SETS), required=True)
    parser.add_argument('--batch-size', type=int, default=0, help='also write batches/<set>_batch_N.txt id lists for the extractors')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    written, batches = 0, 0
    for name in args.set:
        clock_file, care_file = SETS[name]
        clock = {s['school_id']: s for s in json.loads((AUDIT2 / clock_file).read_text(encoding='utf-8'))['schools']}
        care = {s['school_id']: s for s in json.loads((AUDIT2 / care_file).read_text(encoding='utf-8'))['schools']}
        ids = sorted(set(clock) | set(care))
        if args.batch_size:
            BATCHES.mkdir(parents=True, exist_ok=True)
            for index in range(0, len(ids), args.batch_size):
                batches += 1
                (BATCHES / f'{name}_batch_{index // args.batch_size + 1}.txt').write_text('\n'.join(ids[index:index + args.batch_size]) + '\n',
                                                                                         encoding='utf-8')
        for school_id in ids:
            name_ = (clock.get(school_id) or care.get(school_id))['school_name']
            parts = [f'school_id: {school_id}', f'school_name: {name_}', '', '[CLOCK]']
            source = next((f for f in clock.get(school_id, {}).get('files', []) if f.get('status') == 'clock_found'), None)
            if source:
                parts.append(clock_excerpt((TEXT / f"{source['sha256']}.txt").read_text(encoding='utf-8')))
            else:
                fallback = [fallback_clock_excerpt((TEXT / f"{f['sha256']}.txt").read_text(encoding='utf-8'))
                            for f in clock.get(school_id, {}).get('files', []) if f.get('sha256') and (TEXT / f"{f['sha256']}.txt").exists()]
                fallback = [f for f in fallback if f]
                parts.append('(시정표 탐지 안 됨 — 교시·시각이 몰린 구간)\n' + '\n----\n'.join(fallback) if fallback else '(시정표 탐지 안 됨)')
            parts += ['', '[CARE]']
            care_text = []
            for f in care.get(school_id, {}).get('files', []):
                if f.get('sha256'):
                    excerpt = care_excerpt((TEXT / f"{f['sha256']}.txt").read_text(encoding='utf-8'))
                    if excerpt:
                        care_text.append(f"[file: {f['name']}]\n{excerpt}")
            parts.append('\n'.join(care_text) or '(돌봄 시간 문구 없음)')
            (OUT / f'{school_id}.txt').write_text('\n'.join(parts) + '\n', encoding='utf-8')
            written += 1
    print(json.dumps({'written': written, 'batches': batches, 'dir': str(OUT.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
