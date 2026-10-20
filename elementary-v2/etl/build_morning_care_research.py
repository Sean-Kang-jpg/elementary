"""Rebuild Track A's reviewed, research-only sample. Never contacts or writes the DB.

Run from elementary-v2: python -m etl.build_morning_care_research
Requires the existing hash-addressed audit2 archive; no downloads are attempted.
Manual review decisions live in sample_review.json, separate from extraction candidates.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode

from etl.audit_schoolinfo_care_plans import care_candidates

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/research/morning-care-20261015'
ARCHIVE = ROOT / 'etl/runtime/audit2-documents'
DAY = '2026-10-15'


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def write(name: str, value: object) -> None:
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def redact(text: str) -> str:
    text = re.sub(r'[가-힣](?:[*○◯]{2}|[*○◯][가-힣])', '[인명 제외]', text)
    text = re.sub(r'[\w.+-]+@[\w.-]+', '[이메일 제외]', text)
    return text


def excerpt(line: str) -> str:
    if len(line) <= 700:
        return redact(line)
    matches = list(re.finditer(r'아\s*침\s*(?:돌\s*봄|늘\s*봄)', line))
    if not matches:
        return redact(line[:700])
    return redact(' … '.join(line[max(0, m.start() - 25):m.end() + 360] for m in matches[:3]))


def validate(rows: list[dict]) -> list[str]:
    errors = []
    seen = set()
    for r in rows:
        key = (r['school_id'], r['academic_year'], r['calendar_scope'])
        if key in seen:
            errors.append(f'{key}: duplicate observation')
        seen.add(key)
        if r['operation_status'] not in ('confirmed_operating', 'confirmed_not_operating', 'unknown'):
            errors.append(f'{key}: operation status')
        # Annual plans support planned values, never proof of live delivery.
        if r['source_kind'] == 'annual_plan' and r['operation_status'] != 'unknown':
            errors.append(f'{key}: annual plan promoted to live status')
        if r['operation_status'] != 'unknown' and not r.get('operation_evidence'):
            errors.append(f'{key}: live status without evidence')
        if r['plan_status'] == 'not_found' and any(r[k] is not None for k in ('start_time', 'end_time', 'capacity', 'target_grades')):
            errors.append(f'{key}: absent source filled with defaults')
        if r['time_status'] == 'source_conflict' and r['start_time'] is not None:
            errors.append(f'{key}: conflicting start resolved without evidence')
        for k in ('start_time', 'end_time'):
            if r[k] is not None and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', r[k]):
                errors.append(f'{key}: invalid {k}')
        if r['start_time'] and r['end_time'] and r['start_time'] >= r['end_time']:
            errors.append(f'{key}: time order')
        if r['capacity'] is not None and (not isinstance(r['capacity'], int) or r['capacity'] <= 0):
            errors.append(f'{key}: invalid capacity')
        if r['target_grades'] is not None and not set(r['target_grades']) <= set(range(1, 7)):
            errors.append(f'{key}: invalid grades')
        for k in ('start_time', 'end_time', 'target_grades', 'eligibility_raw', 'capacity'):
            if r[k] is not None and not r['field_evidence'].get(k):
                errors.append(f'{key}: {k} without evidence')
        if not r['sources'] or not all(s['raw_hash_valid'] for s in r['sources']):
            errors.append(f'{key}: missing/invalid source')
    return errors


def build() -> dict:
    manifest = read(OUT / 'sample_source_manifest.json')
    reviews = {r['school_id']: r for r in read(OUT / 'sample_review.json')['reviews']}
    rows, source_count = [], 0
    for school in manifest['schools']:
        sid = school['school_id']
        review = reviews.get(sid)
        sources, evidence, automatic = [], [], Counter()
        for f in school['files']:
            digest = f['sha256']
            raw = [p for p in ARCHIVE.glob(f'{digest}.*') if p.is_file()]
            valid = any(hashlib.sha256(p.read_bytes()).hexdigest() == digest for p in raw)
            if not valid:
                raise ValueError(f'{sid}: missing/corrupt raw archive {digest}')
            text_path = ROOT / f['text_path']
            text_digest = hashlib.sha256(text_path.read_bytes()).hexdigest()
            if text_digest != f['text_sha256']:
                raise ValueError(f'{sid}: source text changed; re-review anchors before rebuilding')
            text = text_path.read_text(encoding='utf-8')
            lines = text.splitlines()
            query = {'SHL_IDF_CD': school['shl_idf_cd'], 'JG_BURYU_CD': 'JG150',
                     'JG_HANGMOK_CD': '59', 'JG_GUBUN': '1', 'JG_CHASU': '2',
                     'JG_YEAR': '2026', 'USE_YN': 'Y', 'FILE_SEQ': f['file_seq']}
            sources.append({'document_name': f['name'], 'academic_year_in_filename': f['file_academic_year'],
                            'sha256': digest, 'text_sha256': hashlib.sha256(text_path.read_bytes()).hexdigest(),
                            'raw_hash_valid': valid, 'file_seq': f['file_seq'],
                            'source_url': 'https://www.schoolinfo.go.kr/servlets/EiFileDownLoad.do?' + urlencode(query),
                            'text_path': f['text_path'], 'text_lines': len(lines)})
            automatic.update(care_candidates(text)['morning_candidates'])
            if review and digest.startswith(review['sha_prefix']):
                for lo, hi in review['line_ranges']:
                    if not (1 <= lo <= hi <= len(lines)):
                        raise ValueError(f'{sid}: invalid source line range')
                    evidence.append({'evidence_id': f'{digest[:12]}:L{lo}-L{hi}', 'sha256': digest,
                                     'line_start': lo, 'line_end': hi,
                                     'excerpt': '\n'.join(excerpt(l) for l in lines[lo - 1:hi])})
        if review and not evidence:
            raise ValueError(f'{sid}: reviewed attachment missing')
        refs = [e['evidence_id'] for e in evidence]
        row = {'school_id': sid, 'school_name': school['school_name'], 'district': school['district'],
               'academic_year': 2026, 'calendar_scope': 'term_weekday', 'service_type': 'school_morning_care',
               'operation_status': 'unknown', 'operation_evidence': None,
               'plan_status': ('conditional' if sid in ('B000001853', 'B000001953') else 'planned') if review else 'not_found',
               'start_time': review['start_time'] if review else None,
               'end_time': review['end_time'] if review else None,
               'end_time_raw': '수업전' if sid in ('B000002017', 'B000002123') else review['end_time'] if review else None,
               'time_status': ('source_conflict' if sid == 'B000002216' else 'open_end' if review and not review['end_time'] else 'stated') if review else 'not_found',
               'target_grades': review['target_grades'] if review else None,
               'eligibility_raw': review['eligibility_raw'] if review else None,
               'application_window': None, 'capacity': review['capacity'] if review else None,
               'capacity_qualifier': review['capacity_qualifier'] if review else None,
               'escort_to_school': 'unknown', 'escort_evidence': None,
               'source_kind': 'annual_plan', 'source_year': 2026, 'checked_on': DAY,
               'source_list_checked_at': school['items']['afterschool'].get('checked_at'),
               'source_live_rechecked_on': None, 'review_state': 'assistant_source_text_review',
               'publication_state': 'research_only', 'homepage': school['homepage'],
               'schoolinfo_url': 'https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?' + urlencode({'SHL_IDF_CD': school['shl_idf_cd']}),
               'probe_file': school['probe_file'], 'note': review['note'] if review else '',
               'field_evidence': {k: refs for k in ('start_time', 'end_time', 'target_grades', 'eligibility_raw', 'capacity')
                                  if review and review.get(k) is not None},
               'evidence': evidence, 'sources': sources, 'legacy_regex_candidates': dict(automatic)}
        if not review:
            row['note'] = '선정한 15-라 첨부에서 아침돌봄 근거 미확인; 미운영으로 판단하지 않음'
        if sid == 'B000002216':
            row['start_time_candidates'] = ['07:00', '07:30']
        rows.append(row)
        source_count += len(sources)
    errors = validate(rows)
    if errors:
        raise ValueError('\n'.join(errors))
    populated = {k: sum(r[k] is not None for r in rows) for k in
                 ('start_time', 'end_time', 'target_grades', 'eligibility_raw', 'application_window', 'capacity')}
    summary = {'schools': len(rows), 'districts': len({r['district'] for r in rows}), 'source_files': source_count,
               'hash_verified_source_files': source_count, 'operation_status': dict(Counter(r['operation_status'] for r in rows)),
               'plan_status': dict(Counter(r['plan_status'] for r in rows)), 'time_status': dict(Counter(r['time_status'] for r in rows)),
               'field_populated': populated, 'complete_clock_pairs': sum(bool(r['start_time'] and r['end_time']) for r in rows),
               'escort_verified': sum(r['escort_to_school'] != 'unknown' for r in rows),
               'legacy_regex_detected_schools': sum(bool(r['legacy_regex_candidates']) for r in rows),
               'denominator': 'all 40 sampled schools; planned field coverage, not live-service coverage'}
    payload = {'schema_version': 'morning-care-research-v1', 'checked_on': DAY,
               'scope': 'Seoul 2026 annual-plan source text; 2027 not verified',
               'no_operational_upload': True, 'summary': summary, 'schools': rows}
    write('school_sample.json', payload)
    write('coverage.json', summary)
    fields = ['school_id', 'school_name', 'district', 'academic_year', 'calendar_scope', 'operation_status',
              'plan_status', 'start_time', 'end_time', 'end_time_raw', 'time_status', 'target_grades',
              'eligibility_raw', 'application_window', 'capacity', 'capacity_qualifier', 'escort_to_school',
              'checked_on', 'source_list_checked_at', 'source_live_rechecked_on', 'publication_state', 'note', 'schoolinfo_url']
    with (OUT / 'school_sample.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields + ['source_urls', 'document_hashes'])
        writer.writeheader()
        for row in rows:
            flat = {k: row[k] for k in fields}
            flat['target_grades'] = '|'.join(map(str, row['target_grades'])) if row['target_grades'] else None
            flat['source_urls'] = '\n'.join(s['source_url'] for s in row['sources'])
            flat['document_hashes'] = '|'.join(s['sha256'] for s in row['sources'])
            writer.writerow(flat)
    lines = ['# 학교별 검토표', '', '운영 여부는 전부 `정보 미확인`: 아래 시각은 2026 연간계획에 적힌 값이다. 2027 확정값이 아니다.', '',
             '|구|학교|계획|시작|종료|대상학년|정원|비고|', '|---|---|---|---|---|---|---|---|']
    for r in rows:
        lines.append('|'+ '|'.join([r['district'], f"[{r['school_name']}]({r['schoolinfo_url']})", r['plan_status'],
                                  r['start_time'] or '미확인', r['end_time'] or r['end_time_raw'] or '미확인',
                                  ','.join(map(str,r['target_grades'])) if r['target_grades'] else '미확인',
                                  str(r['capacity']) if r['capacity'] else '미확인', r['note'].replace('|','/')])+'|')
    (OUT / 'SCHOOL_REVIEW.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    return summary


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False, indent=2))
