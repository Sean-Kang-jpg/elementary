"""v3 after-school inputs: the whole 15-라 attachment, tables on their grid, every line numbered.

The v2 inputs kept only lines with a clock time and two lines around them (median 4,381 of 31,498
characters for a Seoul school), so programme names in their own table, grade headers above a table
and untimed course lists never reached the extractor: 84% of the 맞춤형 names found by later
re-extraction were not in the first input (2026-10-20). v3 gives the whole document instead, with
merged cells repeated on every row they cover (etl/school_document_tables.py).

When a school published the same plan as HWP/HWPX and PDF, only the HWP/HWPX is used (it keeps the
table grid); a PDF is used only when it is the school's only file.

    python -m etl.llm_extraction_inputs_v3 --ids etl/runtime/llm_extraction/batches/v3_test30_ids.txt
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path

from etl.school_document_tables import grid_text

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
DOCS = ROOT / 'etl/runtime/audit2-documents'
OUT = ROOT / 'etl/runtime/llm_extraction/inputs_v3'
MAX_CHARS = 100000


def school_files() -> dict[str, dict]:
    schools: dict[str, dict] = {}
    for path in sorted(glob.glob(str(AUDIT2 / 'schoolinfo_care_plan_audit*.json'))):
        for school in json.loads(Path(path).read_text(encoding='utf-8'))['schools']:
            schools.setdefault(school['school_id'], school)
    return schools


def write_input(school: dict, out: Path) -> dict:
    sources = []
    for f in school.get('files', []):
        source = next(iter(sorted(DOCS.glob(f"{f.get('sha256')}.*"))), None) if f.get('sha256') else None
        if source:
            sources.append((f.get('name') or source.name, source))
    structured = [s for s in sources if s[1].suffix.lower() in ('.hwp', '.hwpx')]
    chosen = structured or sources
    parts, used = [], []
    for name, source in chosen:
        kind, text = grid_text(source.read_bytes())
        text = re.sub(r'[ \t]+', ' ', text)
        text = '\n'.join(line for line in text.splitlines() if line.strip(' |'))
        if text:
            parts.append(f'[file: {name}]\n{text}')
            used.append(kind)
    body = '\n'.join(parts)[:MAX_CHARS] or '(첨부 텍스트 없음)'
    numbered = [f'L{i}: {line}' for i, line in enumerate(body.splitlines(), 1)]
    header = [f"school_id: {school['school_id']}", f"school_name: {school.get('school_name', '')}", '', '[DOCUMENT]']
    (out / f"{school['school_id']}.txt").write_text('\n'.join(header + numbered) + '\n', encoding='utf-8')
    return {'school_id': school['school_id'], 'files': len(chosen), 'kinds': used, 'chars': len(body),
            'truncated': len('\n'.join(parts)) > MAX_CHARS}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--ids', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    schools = school_files()
    report = [write_input(schools[i], args.out) for i in args.ids.read_text(encoding='utf-8').split() if i in schools]
    chars = sorted(r['chars'] for r in report)
    print(json.dumps({'written': len(report), 'median_chars': chars[len(chars) // 2], 'max_chars': chars[-1],
                      'truncated': [r['school_id'] for r in report if r['truncated']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
