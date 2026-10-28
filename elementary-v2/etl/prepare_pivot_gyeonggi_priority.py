"""Prepare isolated, full-document inputs for the five Gyeonggi priority areas.

No network, environment loading, LLM calls, or database writes. Coverage must be an
explicit saved snapshot. Existing P1 outputs are references, never an approval.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AREAS = {'bundang', 'wirye', 'suji', 'dongan', 'gwangmyeong'}
CARE = re.compile(r'돌\s*봄|늘\s*봄')
TIME = re.compile(r'\d{1,2}\s*[:;]\s*\d{2}|\d{1,2}\s*시')


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def select_schools(manifest: dict) -> list[dict]:
    selected = [s for s in manifest['schools'] if s['area'] in AREAS
                and (s.get('road_address') or '').startswith(('경기도 ', '경기 '))]
    ids = [s['school_id'] for s in selected]
    if not selected or len(ids) != len(set(ids)):
        raise ValueError('Scope must be nonempty with unique school IDs')
    return selected


def care_windows(lines: list[str]) -> list[dict]:
    """Locate evidence for human review; never infer times or operational status."""
    keep: set[int] = set()
    for index, line in enumerate(lines):
        if CARE.search(line):
            start, end = max(0, index - 2), min(len(lines), index + 5)
            if any(TIME.search(value) for value in lines[start:end]):
                keep.update(range(start, end))
    groups: list[list[int]] = []
    for index in sorted(keep):
        if not groups or index != groups[-1][-1] + 1:
            groups.append([])
        groups[-1].append(index)
    return [{'first_line': group[0] + 1, 'last_line': group[-1] + 1,
             'text': '\n'.join(f'L{i + 1}: {lines[i]}' for i in group)} for group in groups]


def document_input(school: dict, audit: dict, archive: Path, grid_text,
                   text_overrides: dict | None = None) -> tuple[str, list[dict], list[str]]:
    parts, sources, errors, seen = [], [], [], set()
    for attachment in audit.get('files', []):
        sha = attachment.get('sha256')
        if not sha:
            errors.append('attachment_without_sha256')
            continue
        if sha in seen:
            continue
        seen.add(sha)
        override = (text_overrides or {}).get(sha)
        files = ([Path(override['archive_file'])] if override and override.get('archive_file')
                 else sorted(p for p in archive.glob(f'{sha}.*') if p.is_file()))
        if len(files) != 1:
            errors.append(f'{sha}: expected one archived source, found {len(files)}')
            continue
        path = files[0]
        try:
            data = path.read_bytes()
        except OSError as error:
            errors.append(f'{sha}: source read failed ({type(error).__name__})')
            continue
        if digest(data) != sha:
            errors.append(f'{sha}: source hash mismatch')
            continue
        try:
            if override:
                text_bytes = Path(override['text_file']).read_bytes()
                if digest(text_bytes) != override['text_sha256']:
                    errors.append(f'{sha}: override text hash mismatch')
                    continue
                kind, text = override['format'], text_bytes.decode('utf-8')
            else:
                kind, text = grid_text(data)
        except Exception as error:
            errors.append(f'{sha}: extraction failed ({type(error).__name__})')
            continue
        text = '\n'.join(re.sub(r'[ \t]+', ' ', line) for line in text.splitlines() if line.strip(' |'))
        if not re.sub(r'^##### PAGE \d+\s*$', '', text, flags=re.MULTILINE).strip():
            errors.append(f'{sha}: empty extracted text')
            continue
        # Keep every distinct attachment, including differently named PDFs and
        # structured files. No character cap, keyword filtering, or guessed years.
        parts.append(f"[file: {attachment.get('name') or path.name}; sha256: {sha}; "
                     f"academic_year: {attachment.get('file_academic_year')}]\n{text}")
        source = {'name': attachment.get('name'), 'sha256': sha, 'format': kind,
                  'file_academic_year': attachment.get('file_academic_year'), 'chars': len(text)}
        if override:
            source['text_override'] = override
        sources.append(source)
    body = '\n'.join(parts)
    numbered = '\n'.join(f'L{i}: {line}' for i, line in enumerate(body.splitlines(), 1))
    header = f"school_id: {school['school_id']}\nschool_name: {school['school_name']}\n\n[DOCUMENT]\n"
    return header + numbered + '\n', sources, errors


def prepare(manifest_path: Path, coverage_path: Path, p1_path: Path,
            extractor_path: Path, output: Path, overrides_path: Path | None = None,
            recovered_path: Path | None = None) -> dict:
    schools = select_schools(read_json(manifest_path))
    live = read_json(coverage_path)
    coverage = {s['school_id']: s for s in live['schools']}
    if len(coverage) != len(live['schools']) or set(coverage) != {s['school_id'] for s in schools}:
        raise ValueError('Coverage IDs must exactly equal selected school IDs')
    p1 = {s['school_id'] for s in read_json(p1_path)}
    overrides = read_json(overrides_path) if overrides_path else {}
    audits = {}
    for path in sorted((ROOT / 'docs/research/audit2').glob('schoolinfo_care_plan_audit*.json')):
        for school in read_json(path)['schools']:
            audits.setdefault(school['school_id'], school)
    # Recover only an explicitly named failed attachment. Keep historic audits
    # and the shared download index untouched.
    for recovered in read_json(recovered_path) if recovered_path else []:
        audit = audits[recovered['school_id']]
        matches = [f for f in audit['files'] if not f.get('sha256')
                   and f.get('name') == recovered['attachment']['name']]
        if len(matches) != 1:
            raise ValueError('Recovered attachment must match exactly one failed audit attachment')
        matches[0]['sha256'] = recovered['sha256']
    if any(s['school_id'] not in audits for s in schools):
        raise ValueError('A selected school has no source audit')
    extractor_sha = digest(extractor_path.read_bytes())
    spec = importlib.util.spec_from_file_location('pivot_priority_document_tables', extractor_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output.mkdir(parents=True, exist_ok=False)
    inputs = output / 'inputs'
    inputs.mkdir()
    entries, care_queue, new_ids, existing_ids = [], [], [], []
    for index, school in enumerate(schools, 1):
        sid = school['school_id']
        text, sources, errors = document_input(school, audits[sid], ROOT / 'etl/runtime/audit2-documents',
                                              module.grid_text, overrides)
        path = inputs / f'{sid}.txt'
        path.write_text(text, encoding='utf-8')
        # Even a single unreadable attachment blocks readiness. A school with
        # empty output is never reclassified as having no programmes.
        ready = bool(sources) and not errors
        row = {'school_id': sid, 'school_name': school['school_name'], 'area': school['area'],
               'road_address': school['road_address'], 'coverage': coverage[sid],
               'input': path.relative_to(output).as_posix(), 'input_sha256': digest(path.read_bytes()),
               'input_chars': len(text), 'truncated': False, 'sources': sources, 'errors': errors,
               'input_ready': ready, 'course_track': 'existing_p1' if sid in p1 else 'new_priority',
               'course_extraction_status': 'pending', 'approved_for_upload': False}
        entries.append(row)
        (existing_ids if sid in p1 else new_ids).append(sid)
        if coverage[sid].get('care_status') != 'stated':
            body = text.split('[DOCUMENT]\n', 1)[1]
            lines = [line.partition(': ')[2] for line in body.splitlines()]
            care_queue.append({'school_id': sid, 'school_name': school['school_name'],
                               'input_ready': ready, 'input': row['input'],
                               'status': 'needs_source_review', 'evidence_windows': care_windows(lines)})
        print(json.dumps({'prepared': index, 'total': len(schools), 'school_id': sid,
                          'input_ready': ready}), flush=True)
    for name, ids in [('new_course_ids.txt', new_ids), ('existing_p1_ids.txt', existing_ids),
                      ('care_review_ids.txt', [s['school_id'] for s in care_queue])]:
        (output / name).write_text('\n'.join(ids) + '\n', encoding='utf-8')
    if digest(extractor_path.read_bytes()) != extractor_sha:
        raise ValueError('Table extractor changed during preparation; outputs require a fresh run')
    report = {'schema_version': 'pivot-gyeonggi-priority-preparation-v1',
              'coverage_checked_on': live['checked_on'], 'no_operational_upload': True,
              'source_manifest': str(manifest_path), 'coverage_snapshot_sha256': digest(coverage_path.read_bytes()),
              'recovered_attachments': str(recovered_path) if recovered_path else None,
              'table_extractor': str(extractor_path), 'table_extractor_sha256': extractor_sha,
              'summary': {'schools': len(entries), 'by_area': dict(Counter(s['area'] for s in entries)),
                          'inputs_ready': sum(s['input_ready'] for s in entries),
                          'existing_p1': len(existing_ids), 'new_course_targets': len(new_ids),
                          'care_review_targets': len(care_queue),
                          'course_extraction_completed_by_this_run': 0}, 'schools': entries}
    (output / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'care_review_queue.json').write_text(json.dumps({'schools': care_queue}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT / 'docs/research/pivot/pilot_manifest_20261020.json')
    parser.add_argument('--coverage', type=Path, required=True)
    parser.add_argument('--p1-targets', type=Path, default=ROOT / 'docs/research/pivot/p1_afterschool_operating_20261020.json')
    parser.add_argument('--table-extractor', type=Path, required=True,
                        help='Explicit reviewed grid extractor; its SHA256 is recorded')
    parser.add_argument('--out', type=Path, required=True, help='New output directory; existing directories are refused')
    parser.add_argument('--text-overrides', type=Path, help='SHA-keyed text recovery records, each with text_file and text_sha256')
    parser.add_argument('--recovered-attachments', type=Path, help='Explicit source records for previously failed downloads')
    args = parser.parse_args()
    report = prepare(args.manifest, args.coverage, args.p1_targets, args.table_extractor, args.out,
                     args.text_overrides, args.recovered_attachments)
    print(json.dumps(report['summary'], ensure_ascii=False))
    raise SystemExit(0 if report['summary']['inputs_ready'] == report['summary']['schools'] else 1)


if __name__ == '__main__':
    main()
