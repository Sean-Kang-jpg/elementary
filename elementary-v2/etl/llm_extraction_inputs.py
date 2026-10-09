"""E05: per-school source excerpts for LLM extraction (no reviewed values in them).

For each school in the given audits it writes etl/runtime/llm_extraction/inputs/<school_id>.txt with
  [CLOCK] the detected 시정표 window (full lines, around every detected clock block)
  [CARE]  돌봄 passages from the 15-라 plan (lines with care + time, and flattened-text matches)
The extractor reads only these files, so evaluation against the reviewed sets stays blind.

    python -m etl.llm_extraction_inputs --set pilot --set expansion
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
}
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
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    for name in args.set:
        clock_file, care_file = SETS[name]
        clock = {s['school_id']: s for s in json.loads((AUDIT2 / clock_file).read_text(encoding='utf-8'))['schools']}
        care = {s['school_id']: s for s in json.loads((AUDIT2 / care_file).read_text(encoding='utf-8'))['schools']}
        for school_id in sorted(set(clock) | set(care)):
            name_ = (clock.get(school_id) or care.get(school_id))['school_name']
            parts = [f'school_id: {school_id}', f'school_name: {name_}', '', '[CLOCK]']
            source = next((f for f in clock.get(school_id, {}).get('files', []) if f.get('status') == 'clock_found'), None)
            parts.append(clock_excerpt((TEXT / f"{source['sha256']}.txt").read_text(encoding='utf-8')) if source else '(시정표 탐지 안 됨)')
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
    print(json.dumps({'written': written, 'dir': str(OUT.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
