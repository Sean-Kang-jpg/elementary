"""Freeze previously unprocessed Seoul plans without touching shared extraction inputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'docs/research/audit2'
CACHE = ROOT / 'etl/runtime/audit2-documents'
WORK = ROOT / 'etl/runtime/seoul-gap37-20261019'
REPORT = ROOT / 'docs/research/seoul-gap37-20261019'
PROBES = ['schoolinfo_disclosure_probe_20261006.json', 'schoolinfo_disclosure_probe_expansion_20261008.json',
          'schoolinfo_disclosure_probe_wave2_seoul_20261009.json']
CARES = ['schoolinfo_care_plan_audit_20261007.json', 'schoolinfo_care_plan_audit_expansion_20261008.json',
         'schoolinfo_care_plan_audit_wave2_seoul_20261009.json']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    if (REPORT / 'manifest.json').exists():
        raise SystemExit('Existing snapshot is immutable; reuse its numbered inputs.')
    schools = {s['school_id']: s for name in PROBES for s in read(AUDIT / name)['schools'] if s['region'] == '서울특별시'}
    care = {s['school_id']: s for name in CARES for s in read(AUDIT / name)['schools']}
    old = ROOT / 'etl/runtime/llm_extraction/outputs_afterschool'
    processed = {s['school_id'] for folder in ['seoul', 'seoul_retry', 'seoul_noas']
                 for path in (old / folder).glob('batch_*.json') for s in read(path)}
    targets = sorted(set(schools) - processed)
    if len(targets) != 37:
        raise SystemExit(f'Expected 37 unprocessed schools; found {len(targets)}. Reconcile other-session work first.')
    (WORK / 'inputs').mkdir(parents=True, exist_ok=True)
    REPORT.mkdir(parents=True, exist_ok=True)
    entries = []
    for school_id in targets:
        school = schools[school_id]
        entry = {'school_id': school_id, 'school_name': school['school_name'], 'sources': [],
                 'operation_status': 'unknown', 'publication_state': 'research_only'}
        body, mapping = [], []
        for source in care[school_id]['files']:
            sha = source.get('sha256')
            item = {'name': source['name'], 'sha256': sha, 'filename_year': source.get('file_academic_year')}
            entry['sources'].append(item)
            if not sha:
                item['status'] = 'source_unavailable'
                continue
            raw = [p for p in (CACHE / 'raw').glob(f'{sha}.*') if p.is_file()]
            # Different cache versions can store raw originals directly under the cache root.
            if not raw:
                raw = [p for p in CACHE.glob(f'{sha}.*') if p.is_file()]
            item['raw_hash_valid'] = any(hashlib.sha256(p.read_bytes()).hexdigest() == sha for p in raw)
            text_path = CACHE / 'text' / f'{sha}.txt'
            if not text_path.exists():
                item['status'] = 'text_unavailable'
                continue
            data = text_path.read_bytes()
            item['text_sha256'] = hashlib.sha256(data).hexdigest()
            item['text_path'] = str(text_path.relative_to(ROOT)).replace('\\', '/')
            text = data.decode('utf-8-sig')
            item['text_chars'] = len(text)
            # The spreadsheet is an applicant list, not a public course catalogue.
            if re.search(r'명단|신청자', source['name']) or source['name'].lower().endswith('.xlsx'):
                item['status'] = 'excluded_applicant_list'
                continue
            if item['filename_year'] is not None and item['filename_year'] != 2026:
                item['status'] = 'excluded_other_year'
                continue
            item['status'] = 'available' if text.strip() else 'text_empty'
            if not text.strip():
                continue
            body.append(f"[file: {source['name']}; sha256: {sha}]")
            mapping.append({'input_line': len(body), 'sha256': sha, 'source_line': None})
            for number, line in enumerate(text.splitlines(), 1):
                body.append(line)
                mapping.append({'input_line': len(body), 'sha256': sha, 'source_line': number})
        numbered = '\n'.join([f'school_id: {school_id}', f"school_name: {school['school_name']}", '[COMBINED_RESEARCH]']
                             + [f'L{n}: {line}' for n, line in enumerate(body, 1)]) + '\n'
        path = WORK / 'inputs' / f'{school_id}.txt'
        path.write_text(numbered, encoding='utf-8')
        entry['input_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        entry['input_path'] = str(path.relative_to(ROOT)).replace('\\', '/')
        map_path = WORK / 'inputs' / f'{school_id}.lines.json'
        map_path.write_text(json.dumps(mapping, ensure_ascii=False), encoding='utf-8')
        entry['line_map_path'] = str(map_path.relative_to(ROOT)).replace('\\', '/')
        entries.append(entry)
    result = {'checked_on': '2026-10-19', 'source_scope': 'cached Schoolinfo 2026 disclosure attachments; not live re-fetched',
              'schools': entries, 'no_network': True, 'no_db_writes': True, 'no_shared_output_writes': True}
    (REPORT / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'schools': len(entries), 'sources': sum(len(e['sources']) for e in entries),
                      'raw_hash_valid': sum(s.get('raw_hash_valid', False) for e in entries for s in e['sources']),
                      'inputs': str(WORK / 'inputs')}, ensure_ascii=True))


if __name__ == '__main__':
    main()
