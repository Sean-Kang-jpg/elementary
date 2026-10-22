"""Prepare lossless source-review packets, never course rows or approval decisions.

The stage2 table heuristic was rejected after merged cells and inherited heading
context produced incorrect metadata. Preserve complete input and line references
for source review rather than offering those rows to the production loader.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def numbered_lines(text: str) -> list[tuple[int, str]]:
    lines = []
    for line in text.splitlines():
        match = re.match(r'^L(\d+):\s?(.*)$', line)
        if match:
            lines.append((int(match[1]), line))
    if not lines or [n for n, _ in lines] != list(range(1, len(lines) + 1)):
        raise ValueError('Numbered source must be complete and sequential from L1')
    return lines


def run(manifest: Path, output: Path, *, chunk_chars: int = 14000) -> dict:
    if chunk_chars < 100:
        raise ValueError('chunk_chars must be at least 100')
    data = json.loads(manifest.read_text(encoding='utf8'))
    schools = data['schools']
    if (data['cohort_size'] != 39 or len(schools) != 39
            or len({s['school_id'] for s in schools}) != 39):
        raise ValueError('Expected the unique 39-school stage2 cohort')
    if output.exists():
        raise ValueError('Use a new packet directory; no existing files are overwritten')
    checked = []
    # Validate the entire cohort before the first write.
    for school in schools:
        if not school['ready'] or school['truncated']:
            raise ValueError('Incomplete input: ' + school['school_id'])
        raw = Path(school['input_file']).read_bytes()
        if digest(raw) != school['input_sha256']:
            raise ValueError('Input changed: ' + school['school_id'])
        for source in school.get('supplemental_visual_sources', []):
            if digest(Path(source['file']).read_bytes()) != source['sha256']:
                raise ValueError('Visual source changed: ' + school['school_id'])
        text = raw.decode('utf8')
        checked.append((school, raw, text, numbered_lines(text)))
    output.mkdir(parents=True)
    results = []
    for school, raw, text, lines in checked:
        folder = output / school['school_id']
        folder.mkdir()
        # The byte-identical full input is the authority. Chunks are navigation aids.
        (folder / 'full_input.txt').write_bytes(raw)
        chunks, current, size = [], [], 0
        for number, line in lines:
            if current and size + len(line) + 1 > chunk_chars:
                chunks.append(current); current, size = [], 0
            current.append((number, line)); size += len(line) + 1
        if current:
            chunks.append(current)
        chunk_records = []
        for index, chunk in enumerate(chunks, 1):
            path = folder / f'source_{index:03}.txt'
            path.write_text('\n'.join(line for _, line in chunk) + '\n', encoding='utf8')
            chunk_records.append({'file':path.as_posix(), 'first_line':chunk[0][0],
                                  'last_line':chunk[-1][0], 'sha256':digest(path.read_bytes())})
        flags = []
        if '|' not in text:
            flags.append('flattened_text_requires_pdf_visual_table_review')
        if re.search(r'예시|예상\s*시간표', text):
            flags.append('example_schedule_must_not_be_treated_as_confirmed')
        if re.search(r'폐강|미운영', text):
            flags.append('closure_and_term_scope_require_review')
        if len(text) > 100000:
            flags.append('long_source_preserved_in_full')
        if school.get('supplemental_visual_sources'):
            flags.append('supplemental_images_must_be_read_alongside_text')
        results.append({'school_id':school['school_id'], 'school_name':school['school_name'],
                        'input_sha256':school['input_sha256'], 'numbered_lines':len(lines),
                        'full_input':(folder/'full_input.txt').as_posix(), 'chunks':chunk_records,
                        'supplemental_visual_sources':school.get('supplemental_visual_sources', []),
                        'risk_flags':flags, 'source_review_status':'pending'})
    report = {'schema_version':'pivot-p1-stage2-source-packets-v1',
              'manifest_sha256':digest(manifest.read_bytes()), 'schools_processed':39,
              'method':'lossless source packets; no normalized course extraction',
              'source_review_complete':False, 'blind_sample_verification_complete':False,
              'publish_status':'not_approved', 'no_operational_upload':True, 'schools':results}
    (output/'pivot_packets.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args = parser.parse_args()
    report = run(args.manifest,args.out)
    print(json.dumps({'schools_processed':39, 'source_chunks':sum(len(s['chunks']) for s in report['schools']),
                      'publish_status':report['publish_status']}))


if __name__ == '__main__':
    main()
