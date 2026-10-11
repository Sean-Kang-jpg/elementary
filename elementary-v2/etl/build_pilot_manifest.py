"""Pilot expansion manifest: target schools with their 학교알리미 and NEIS identifiers.

The NEIS school and office codes come from the school's own 학교알리미 page, which embeds
them (`sdSchulCode`, and an office-code mapping keyed by `lctnScCd`). `--validate-poc` checks
that method against the 59 links verified by address in Audit 2 E02 before it is trusted.

    python -m etl.build_pilot_manifest --validate-poc
    python -m etl.build_pilot_manifest             # writes the expansion manifest
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def env_value(name: str) -> str | None:
    """Environment first, then elementary-v2/.env; values are never printed."""
    import os
    if os.environ.get(name):
        return os.environ[name]
    env_file = ROOT / '.env'
    for line in env_file.read_text(encoding='utf-8').splitlines() if env_file.exists() else []:
        key, _, value = line.partition('=')
        if key.strip() == name:
            return value.strip().strip('"').strip("'")
    return None
AUDIT2 = ROOT / 'docs/research/audit2'
OUT = AUDIT2 / 'pilot_expansion_manifest_20261008.json'
# 2026-10-08 user decision: 성남시 전체 + 서울 강남·서초·송파.
SCOPES = {
    'seongnam': 'road_address=ilike.*성남시*',
    'seoul_gangnam3': 'or=(road_address.ilike.서울*강남구*,road_address.ilike.서울*서초구*,road_address.ilike.서울*송파구*)',
    # 2026-10-09: wave 2, the rest of Seoul
    'seoul_rest': 'and=(road_address.ilike.서울*,road_address.not.ilike.*강남구*,road_address.not.ilike.*서초구*,road_address.not.ilike.*송파구*)',
}
DECISIONS = {
    'seongnam': '2026-10-08 사용자 결정: 성남시 전체 + 서울 강남·서초·송파',
    'seoul_gangnam3': '2026-10-08 사용자 결정: 성남시 전체 + 서울 강남·서초·송파',
    'seoul_rest': '2026-10-09 사용자 결정: 서울 나머지 22개 구 (LLM 추출 2차)',
}
SCHOOL_PAGE = 'https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do'


def supabase_get(path: str) -> list[dict]:
    url = (env_value('VITE_SUPABASE_URL') or env_value('SUPABASE_URL')).rstrip('/')
    key = env_value('VITE_SUPABASE_ANON_KEY') or env_value('SUPABASE_ANON_KEY')  # public reads only
    rows, start = [], 0
    while True:
        safe_path = urllib.parse.quote(path, safe='=&*,().?/_-:')  # Korean filter values must be percent-encoded
        request = urllib.request.Request(f'{url}/rest/v1/{safe_path}', headers={'apikey': key, 'Authorization': f'Bearer {key}',
                                                                          'Range': f'{start}-{start + 999}'})
        with urllib.request.urlopen(request, timeout=60) as response:
            page = json.loads(response.read().decode('utf-8'))
        rows.extend(page)
        if len(page) < 1000:
            return rows
        start += 1000


def schoolinfo_ids() -> dict[str, str]:
    index = {}
    for file in (ROOT / 'etl/local_outputs_20260320').glob('schoolinfo_2026_basic_*.json'):
        data = json.loads(file.read_text(encoding='utf-8'))
        rows = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), [])
        for row in rows:
            if row.get('SCHUL_CODE') and row.get('SHL_IDF_CD'):
                index[row['SCHUL_CODE']] = row['SHL_IDF_CD']
    return index


def neis_codes_from_page(html: str) -> tuple[str | None, str | None]:
    """(NEIS office code, NEIS school code) as the 학교알리미 page itself states them."""
    school = re.search(r'var\s+sdSchulCode\s*=\s*"(\d{7})"', html)
    location = re.search(r'var\s+lctnScCd\s*=\s*"(\d{2})"', html)
    mapping = dict(re.findall(r"lctnScCd\s*==\s*'(\d{2})'\)\s*sidoScCode\s*=\s*'([A-Z]\d{2})'", html))
    office = mapping.get(location.group(1)) if location else None
    return office, school.group(1) if school else None


def fetch_page(shl_idf_cd: str) -> str:
    query = urllib.parse.urlencode({'SHL_IDF_CD': shl_idf_cd})
    with urllib.request.urlopen(f'{SCHOOL_PAGE}?{query}', timeout=60) as response:
        raw = response.read()
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('cp949', 'replace')


def validate_poc() -> None:
    crosswalk = json.loads((AUDIT2 / 'neis_reconciled_crosswalk_20261006.json').read_text(encoding='utf-8'))['crosswalk']
    manifest = {s['school_id']: s for s in json.loads((AUDIT2 / 'poc_school_manifest_20261006.json').read_text(encoding='utf-8'))['schools']}
    ids = schoolinfo_ids()
    same, differ, missing = 0, [], []
    for row in crosswalk:
        if not row.get('neis_school_code'):
            continue
        shl = ids.get(manifest[row['school_id']]['schoolinfo_code'])
        office, code = neis_codes_from_page(fetch_page(shl)) if shl else (None, None)
        time.sleep(0.5)
        if not code:
            missing.append(row['school_id'])
        elif (office, code) == (row['neis_office_code'], row['neis_school_code']):
            same += 1
        else:
            differ.append({'school_id': row['school_id'], 'page': [office, code], 'verified': [row['neis_office_code'], row['neis_school_code']]})
    print(json.dumps({'verified_links': same + len(differ) + len(missing), 'same': same, 'differ': differ, 'missing': missing}, ensure_ascii=False, indent=2))


def build(scopes: list[str], out: Path) -> None:
    ids = schoolinfo_ids()
    poc = {s['school_id'] for s in json.loads((AUDIT2 / 'poc_school_manifest_20261006.json').read_text(encoding='utf-8'))['schools']}
    schools = []
    for scope in scopes:
        condition = SCOPES[scope]
        for row in supabase_get(f'school_master?select=school_id,school_name,schoolinfo_code,road_address&{condition}&order=school_id'):
            shl = ids.get(row.get('schoolinfo_code') or '')
            office, code = (None, None)
            if shl:
                office, code = neis_codes_from_page(fetch_page(shl))
                time.sleep(0.5)
            schools.append({**row, 'scope': scope, 'in_poc': row['school_id'] in poc, 'shl_idf_cd': shl,
                            'neis_office_code': office, 'neis_school_code': code})
    summary = {'schools': len(schools), 'new': sum(not s['in_poc'] for s in schools),
               'with_schoolinfo_id': sum(bool(s['shl_idf_cd']) for s in schools),
               'with_neis_code': sum(bool(s['neis_school_code']) for s in schools)}
    out.write_text(json.dumps({'schema_version': 'pilot-expansion-manifest-v1', 'built_on': date.today().isoformat(),
                               'decision': ' / '.join(sorted({DECISIONS[s] for s in scopes})),
                               'neis_code_source': '학교알리미 학교 페이지의 sdSchulCode·lctnScCd (E02 검증 링크와 대조 후 채택)',
                               'summary': summary, 'schools': schools}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--validate-poc', action='store_true')
    parser.add_argument('--scope', action='append', choices=sorted(SCOPES), help='default: the 2026-10-08 expansion (seongnam, seoul_gangnam3)')
    parser.add_argument('--out', default=str(OUT))
    args = parser.parse_args()
    validate_poc() if args.validate_poc else build(args.scope or ['seongnam', 'seoul_gangnam3'], Path(args.out))


if __name__ == '__main__':
    main()
