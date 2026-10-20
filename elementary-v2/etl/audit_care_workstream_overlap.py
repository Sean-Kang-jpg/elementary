"""Offline, read-only inventory of care workstreams; never extracts with an LLM.

Writes only to a new audit report directory. Character/byte counts are NOT tokens.
Run: python -m etl.audit_care_workstream_overlap --out <new-report-directory>
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'docs/research/audit2'
RUNTIME = ROOT / 'etl/runtime/llm_extraction'
TEXT = ROOT / 'etl/runtime/audit2-documents/text'
RESEARCH = ROOT / 'docs/research/morning-care-20261015'
SETS = [
    ('schoolinfo_disclosure_probe_20261006.json', 'schoolinfo_care_plan_audit_20261007.json'),
    ('schoolinfo_disclosure_probe_expansion_20261008.json', 'schoolinfo_care_plan_audit_expansion_20261008.json'),
    ('schoolinfo_disclosure_probe_wave2_seoul_20261009.json', 'schoolinfo_care_plan_audit_wave2_seoul_20261009.json'),
    ('schoolinfo_disclosure_probe_wave3_gyeonggi_20261010.json', 'schoolinfo_care_plan_audit_wave3_gyeonggi_20261010.json'),
    ('schoolinfo_disclosure_probe_province_sample_20261011.json', 'schoolinfo_care_plan_audit_province_sample_20261011.json'),
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def source_windows(text: str) -> dict[str, dict[int, str]]:
    """Diagnostic windows, not a production morning extractor or recall guarantee.

    After/custom selection mirrors current helpers including their character caps.
    Line identity makes shared input removable without semantic fuzzy matching.
    """
    from etl.llm_extraction_inputs import TIME, AFTERSCHOOL_KEY, GRADE_HINT, WEEKDAY, DURATION
    lines = text.splitlines()
    selections = {key: set() for key in ('morning', 'afterschool', 'custom')}
    for index, line in enumerate(lines):
        if re.search(r'아침\s*(?:돌봄|늘봄)|오전\s*돌봄|등교\s*전', line):
            selections['morning'].update(range(max(0, index - 12), min(len(lines), index + 13)))
        if ((TIME.search(line) and (AFTERSCHOOL_KEY.search(line) or GRADE_HINT.search(line) or WEEKDAY.search(line)))
                or (WEEKDAY.search(line) and DURATION.search(line))):
            selections['afterschool'].update(range(max(0, index - 2), min(len(lines), index + 3)))
        if '맞춤형' in line:
            selections['custom'].update(range(max(0, index - 12), min(len(lines), index + 13)))
    result = {}
    for kind, selected in selections.items():
        cap = 14000 if kind == 'afterschool' else 10000
        used, previous, kept = 0, None, {}
        for index in sorted(selected):
            if previous is not None:
                used += 1 if index == previous + 1 else 6  # newline / separator overhead
            line = re.sub(r'[ \t]+', ' ', lines[index])[:1500]
            if used >= cap:
                break
            kept[index] = line[:cap - used]
            used += len(line)
            previous = index
        result[kind] = kept
    return result


def size(lines: dict) -> dict:
    text = '\n'.join(lines[k] for k in sorted(lines))
    return {'characters': len(text), 'utf8_bytes': len(text.encode('utf-8')), 'source_lines': len(lines)}


def merge_lines(*groups: dict) -> dict:
    result = {}
    for group in groups:
        for key, value in group.items():
            if len(value) >= len(result.get(key, '')):
                result[key] = value
    return result


def run() -> dict:
    probes, schools, care, input_hashes = [], {}, {}, {}
    for probe_name, care_name in SETS:
        path = AUDIT / probe_name
        data = path.read_bytes()
        input_hashes[str(path.relative_to(ROOT))] = digest(data)
        records = json.loads(data)['schools']
        probes.append({'file': probe_name, 'records': len(records),
                       'regions': dict(Counter(r['region'] for r in records))})
        for record in records:
            schools[record['school_id']] = record
        for record in load(AUDIT / care_name)['schools']:
            care[record['school_id']] = record
    seoul = {key for key, r in schools.items() if r['region'] == '서울특별시'}
    sample = {r['school_id'] for r in load(RESEARCH / 'school_sample.json')['schools']}

    batches = {}
    for path in sorted((RUNTIME / 'batches').glob('custom_noc_*.txt')):
        batches[path.stem] = set(path.read_text(encoding='utf-8-sig').split())
    workers = {k: v for k, v in batches.items() if re.fullmatch(r'custom_noc_worker_\d+', k)}
    worker_overlap = []
    for a in workers:
        for b in workers:
            if a < b and workers[a] & workers[b]:
                worker_overlap.append({'a': a, 'b': b, 'school_ids': sorted(workers[a] & workers[b])})

    folders, custom_rows, result_files, seen_records = {}, [], {}, {}
    for path in sorted((RUNTIME / 'outputs_custom').glob('*/*.json')):
        data = path.read_bytes()
        records = json.loads(data)
        if not isinstance(records, list):
            continue
        folder = path.parent.name
        info = folders.setdefault(folder, {'files': 0, 'records': 0, 'school_ids': set(), 'nonempty': set(), 'rows': 0})
        info['files'] += 1
        result_files[str(path.relative_to(ROOT))] = {'sha256': digest(data), 'bytes': len(data)}
        for record in records:
            school_id = record['school_id']
            info['records'] += 1
            info['school_ids'].add(school_id)
            rows = record.get('rows', [])
            if rows:
                info['nonempty'].add(school_id)
            info['rows'] += len(rows)
            seen_records.setdefault((folder, school_id), []).append(str(path.relative_to(ROOT)))
            if folder == 'seoul_noc':
                custom_rows.extend((school_id, row, str(path.relative_to(ROOT))) for row in rows)
    completed = folders.get('seoul_noc', {}).get('school_ids', set())

    issues, warnings, stats = [], [], Counter()
    for school_id, row, file in custom_rows:
        common = {'school_id': school_id, 'file': file, 'row': row}
        if not isinstance(row, list) or len(row) != 6:
            issues.append({**common, 'issue': 'row_shape'})
            continue
        name, day, start, end, grades, line_number = row
        input_path = RUNTIME / 'inputs_custom_noc' / f'{school_id}.txt'
        if not input_path.exists():
            issues.append({**common, 'issue': 'missing_numbered_input'})
            continue
        input_data = input_path.read_bytes()
        input_hashes[str(input_path.relative_to(ROOT))] = digest(input_data)
        numbered = {int(m[1]): m[2] for line in input_data.decode('utf-8-sig').splitlines()
                    if (m := re.match(r'L(\d+):\s?(.*)', line))}
        if not isinstance(line_number, int) or line_number not in numbered:
            issues.append({**common, 'issue': 'source_line_not_found'})
        else:
            stats['valid_source_line_rows'] += 1
            squash = lambda s: re.sub(r'\s+', '', s or '')
            if squash(name) not in squash(numbered[line_number]):
                warnings.append({**common, 'issue': 'name_not_literal_on_cited_line',
                                 'source_line': numbered[line_number]})
        if day is None:
            stats['weekday_unknown_rows'] += 1
            if start is not None or end is not None:
                issues.append({**common, 'issue': 'unknown_weekday_has_time'})
        elif not isinstance(day, str) or len(day) != 1 or day not in '월화수목금':
            issues.append({**common, 'issue': 'weekday_format'})
        for value in (start, end):
            if value is not None and (not isinstance(value, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value)):
                issues.append({**common, 'issue': 'time_format'})
        if isinstance(start, str) and isinstance(end, str) and start >= end:
            issues.append({**common, 'issue': 'nonpositive_duration'})
        if not isinstance(name, str) or not name.strip():
            issues.append({**common, 'issue': 'empty_name'})
        if grades is None:
            stats['grades_unknown_rows'] += 1
        if start is None or end is None:
            stats['incomplete_time_rows'] += 1
    duplicates = [{'folder': folder, 'school_id': school_id, 'files': files}
                  for (folder, school_id), files in seen_records.items() if len(files) > 1]

    metrics, window_cache = {}, {}
    for cohort, ids in [('sample40', sample), ('seoul606', seoul)]:
        totals = {key: Counter() for key in ['morning_only', 'afterschool_custom', 'all_joint', 'morning_plus_ac_separate', 'three_separate']}
        missing, found, schools_with_morning, hashes = [], 0, 0, set()
        for school_id in sorted(ids):
            chosen = {key: {} for key in ('morning', 'afterschool', 'custom')}
            school_missing = False
            for source in care.get(school_id, {}).get('files', []):
                sha = source.get('sha256')
                if not sha:
                    school_missing = True
                    continue
                path = TEXT / f'{sha}.txt'
                if not path.exists():
                    school_missing = True
                    continue
                data = path.read_bytes()
                hashes.add(sha)
                input_hashes[str(path.relative_to(ROOT))] = digest(data)
                if sha not in window_cache:
                    window_cache[sha] = source_windows(data.decode('utf-8-sig'))
                for kind, lines in window_cache[sha].items():
                    chosen[kind].update({(sha, n): line for n, line in lines.items()})
            if school_missing or not care.get(school_id, {}).get('files'):
                missing.append(school_id)
            if any(chosen.values()):
                found += 1
            if chosen['morning']:
                schools_with_morning += 1
            m, a, c = chosen['morning'], chosen['afterschool'], chosen['custom']
            ac, all_lines = merge_lines(a, c), merge_lines(a, c, m)
            for key, selections in [('morning_only', [m]), ('afterschool_custom', [ac]),
                                    ('all_joint', [all_lines]), ('morning_plus_ac_separate', [m, ac]),
                                    ('three_separate', [m, a, c])]:
                for selection in selections:
                    totals[key].update(size(selection))
        metrics[cohort] = {'schools': len(ids), 'schools_with_any_window': found,
                           'schools_with_morning_window': schools_with_morning,
                           'source_text_files': len(hashes), 'missing_source_school_ids': missing,
                           'input_sizes_excluding_prompt_headers_outputs': {k: dict(v) for k, v in totals.items()}}

    changed = []
    for rel, info in result_files.items():
        if digest((ROOT / rel).read_bytes()) != info['sha256']:
            changed.append(rel)
    for info in folders.values():
        info['unique_schools'] = len(info.pop('school_ids'))
        info['nonempty_schools'] = len(info.pop('nonempty'))
    return {
        'schema_version': 'care-workstream-audit-v1',
        'captured_at': datetime.now(timezone(timedelta(hours=9))).isoformat(),
        'no_llm_calls': True, 'no_db_writes': True, 'no_extraction_output_writes': True,
        'probes': probes, 'unique_probe_schools': len(schools),
        'unique_probe_regions': dict(Counter(s['region'] for s in schools.values())),
        'custom_output_folders': folders, 'custom_result_files': result_files,
        'outputs_changed_during_read': changed,
        'batch_sizes': {k: len(v) for k, v in batches.items()},
        'worker_pair_overlaps': worker_overlap,
        'worker_union_schools': len(set().union(*workers.values())) if workers else 0,
        'worker_schools_with_output': len(set().union(*workers.values()) & completed) if workers else 0,
        'morning_sample_overlap_with_custom_completed': sorted(sample & completed),
        'morning_sample_overlap_with_custom_assigned': sorted(sample & set().union(*workers.values())) if workers else [],
        'duplicate_school_records_within_output_folder': duplicates,
        'custom_structural_qa': {'rows_checked': len(custom_rows), 'counters': dict(stats), 'issues': issues,
                                 'name_anchor_warnings': warnings,
                                 'limits': 'Line existence/literal name checks do not verify weekday, time, term, fee, or grade semantics.'},
        'input_volume_comparison': metrics,
        'input_volume_limits': 'Characters/UTF-8 bytes are not model tokens. Diagnostic morning windows have unmeasured recall. Prompt, headers, output, tool/context/reasoning and cache usage are excluded. No provider A/B calls were made.',
        'input_hashes': input_hashes,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        raise SystemExit('Choose a new report directory; existing reports are never overwritten.')
    result = run()
    args.out.mkdir(parents=True)
    (args.out / 'inventory.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('input_hashes', 'custom_result_files', 'custom_structural_qa')}, ensure_ascii=True, indent=2))
    print(json.dumps({'qa_counts': {k: len(v) if isinstance(v, list) else v for k, v in result['custom_structural_qa'].items() if k != 'limits'}}, ensure_ascii=True))


if __name__ == '__main__':
    main()
