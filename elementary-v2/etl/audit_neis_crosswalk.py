"""Read-only PoC reconciliation using existing ETL rules and paired Schoolinfo evidence.

Prints public-field evidence only. No network, uploads, master changes or file writes.
The raw strict NEIS collection remains preserved as historical evidence.
"""
import hashlib
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from etl.build_school_master_v2 import current_district, with_district
from etl.region_registry import load_registry

PROJECT = Path(__file__).resolve().parents[1]
EVIDENCE = PROJECT / 'docs/research/audit2'
SOURCE_DIR = PROJECT / 'etl/local_outputs_20260320'


def name_key(value):
    return re.sub(r'\s', '', unicodedata.normalize('NFC', str(value or '')))


def address_key(value):
    canonical = load_registry().canonicalize_address(str(value or ''))
    return re.sub(r'[\s,]', '', re.sub(r'\([^)]*\)', '', unicodedata.normalize('NFC', canonical)))


def reconcile(school, candidates, basics):
    basic = [b for b in basics if b.get('SCHUL_CODE') == school['schoolinfo_code']]
    if len(basic) != 1 or name_key(basic[0].get('SCHUL_NM')) != name_key(school['school_name']):
        return {'school_id': school['school_id'], 'status': 'hold_schoolinfo_identity', 'neis_school_code': None}
    basic = basic[0]
    found = {}
    for candidate in candidates:
        if candidate.get('ATPT_OFCDC_SC_CODE') != school['neis_office_code'] or candidate.get('SCHUL_KND_SC_NM') != '초등학교' or name_key(candidate.get('SCHUL_NM')) != name_key(school['school_name']):
            continue
        if not re.fullmatch(r'\d{7}', str(candidate.get('SD_SCHUL_CODE', ''))):
            continue
        target = candidate.get('ORG_RDNMA')
        if not target or address_key(basic.get('SCHUL_RDNMA')) != address_key(target):
            continue
        address = school['road_address']
        district = current_district({'address': address}, basic)
        comparison_address = with_district(address, district) if district else address
        if not comparison_address or address_key(comparison_address) != address_key(target):
            continue
        found[candidate['SD_SCHUL_CODE']] = {
            'school_id': school['school_id'], 'schoolinfo_code': school['schoolinfo_code'],
            'school_name': school['school_name'], 'neis_office_code': school['neis_office_code'],
            'neis_school_code': candidate['SD_SCHUL_CODE'], 'status': 'verified_etl_schoolinfo_address',
            'live_road_address': address, 'schoolinfo_road_address': basic['SCHUL_RDNMA'],
            'neis_road_address': target, 'comparison_address': comparison_address,
            'district_update_used': district, 'merged_region_normalization_used': address_key(address) != re.sub(r'[\s,]', '', re.sub(r'\([^)]*\)', '', str(address or ''))) or address_key(target) != re.sub(r'[\s,]', '', re.sub(r'\([^)]*\)', '', str(target or ''))),
            'publish_status': 'not_approved',
        }
    if len(found) == 1:
        return next(iter(found.values()))
    return {'school_id': school['school_id'], 'status': 'hold_ambiguous' if found else 'hold_address_or_schoolinfo_mismatch', 'neis_school_code': None}


def main():
    manifest = json.loads((EVIDENCE / 'poc_school_manifest_20261006.json').read_text(encoding='utf-8'))
    raw = json.loads((EVIDENCE / 'neis_poc_evidence_20261006.json').read_text(encoding='utf-8'))
    live_evidence = json.loads((EVIDENCE / 'poc_live_addresses_20261006.json').read_text(encoding='utf-8'))
    live = {s['school_id']: s for s in live_evidence['rows']}
    candidates = {r['school_id']: r['candidates'] for r in raw['crosswalk']}
    sources, basics = [], []
    for filename in ('schoolinfo_2026_basic_capital.json', 'schoolinfo_2026_basic_c10.json', 'schoolinfo_2026_basic_q10.json'):
        path = SOURCE_DIR / filename
        payload = path.read_bytes()
        basics.extend(json.loads(payload))
        sources.append({'file': f'etl/local_outputs_20260320/{filename}', 'sha256': hashlib.sha256(payload).hexdigest(), 'kind': 'existing_local_snapshot_not_live_refetch'})
    if len(live) != 60 or set(live) != {s['school_id'] for s in manifest['schools']}:
        raise ValueError('live_denominator_mismatch')
    results = []
    for original in manifest['schools']:
        current = live[original['school_id']]
        if current['schoolinfo_code'] != original['schoolinfo_code'] or current['school_name'] != original['school_name']:
            raise ValueError('live_identity_changed_requires_review')
        results.append(reconcile({**original, **current}, candidates[original['school_id']], basics))
    pairs = [(r['neis_office_code'], r['neis_school_code']) for r in results if r['neis_school_code']]
    if len(set(pairs)) != len(pairs):
        raise ValueError('duplicate_neis_identity')
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'denominator': 60, 'rule_version': 'existing-etl-schoolinfo-v2', 'counts': dict(Counter(r['status'] for r in results)), 'no_operational_upload': True, 'neis_evidence_captured_at': raw['captured_at'], 'live_evidence_captured_at': live_evidence['captured_at'], 'schoolinfo_sources': sources, 'rule_sources': [], 'crosswalk': results}
    for filename in ('etl/region_registry.py', 'etl/region_registry.json', 'etl/build_school_master_v2.py'):
        report['rule_sources'].append({'file': filename, 'sha256': hashlib.sha256((PROJECT / filename).read_bytes()).hexdigest()})
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
