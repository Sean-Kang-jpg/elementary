"""어디초 2.0 pilot manifest: the 11 pilot areas, their schools, and which school-day layers exist.

Reads only the public contract (anon key): `school_master` for the school list, and
`school_day_estimates`, `school_care_hours`, `school_afterschool_summary` for coverage.
The output says, per school, which layer still has to be filled. Nothing is written to the DB.

    python -m etl.build_pivot_pilot_manifest            # writes docs/research/pivot/pilot_manifest_<date>.json
    python -m etl.build_pivot_pilot_manifest --dry-run  # prints the summary only
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'docs/research/pivot'
DECISION = '2026-10-20 사용자 결정: 학군지 10곳 + 위례, 3단계 확장. 운영 파일럿은 분당·판교와 위례'

# (area key, stage, every substring the road address must contain)
AREAS = [
    ('gangnam', 1, ('서울', '강남구')),
    ('seocho', 1, ('서울', '서초구')),
    ('songpa', 1, ('서울', '송파구')),
    ('bundang', 1, ('성남시', '분당구')),
    ('yangcheon', 2, ('서울', '양천구')),
    ('nowon', 2, ('서울', '노원구')),
    ('suji', 3, ('용인시', '수지구')),
    ('dongan', 3, ('안양시', '동안구')),
    ('gwangmyeong', 3, ('광명시',)),
]
# 위례: the new town spans 송파·성남 수정·하남, plus three nearby schools the user added.
# Schools already inside 송파 keep their 송파 row and are tagged 위례 too.
WIRYE = {
    '서울송례초등학교', '서울위례솔초등학교', '서울위례별초등학교', '서울오금초등학교', '서울방이초등학교',
    '서울위례초등학교', '위례한빛초등학교', '위례고운초등학교', '위례중앙초등학교', '위례푸른초등학교',
    '위례초등학교', '위례숲초등학교',
}
WIRYE_CITIES = ('서울', '성남시', '하남시')
OPERATING_PILOT = {'bundang', 'wirye'}


def env_value(name: str) -> str | None:
    """Environment first, then elementary-v2/.env; values are never printed."""
    if os.environ.get(name):
        return os.environ[name]
    env_file = ROOT / '.env'
    for line in env_file.read_text(encoding='utf-8').splitlines() if env_file.exists() else []:
        key, _, value = line.partition('=')
        if key.strip() == name:
            return value.strip().strip('"').strip("'")
    return None


def fetch_all(base: str, key: str, table: str, select: str) -> list[dict]:
    """Supabase caps a read at 1000 rows, so page with Range like the frontend does."""
    rows: list[dict] = []
    start = 0
    while True:
        url = f'{base}/rest/v1/{table}?select={urllib.parse.quote(select)}'
        request = urllib.request.Request(url, headers={
            'apikey': key, 'Authorization': f'Bearer {key}', 'Range': f'{start}-{start + 999}',
        })
        with urllib.request.urlopen(request, timeout=60) as response:
            page = json.load(response)
        rows.extend(page)
        if len(page) < 1000:
            return rows
        start += 1000


def area_of(school: dict) -> str | None:
    address = school.get('road_address') or ''
    for key, _, parts in AREAS:
        if all(part in address for part in parts):
            return key
    return 'wirye' if is_wirye(school) else None


def is_wirye(school: dict) -> bool:
    # 천안 also has a 위례초등학교, so the name alone is not enough
    address = school.get('road_address') or ''
    return school.get('school_name') in WIRYE and any(city in address for city in WIRYE_CITIES)


def build() -> dict:
    base = (env_value('SUPABASE_URL') or env_value('VITE_SUPABASE_URL') or '').rstrip('/')
    key = env_value('VITE_SUPABASE_ANON_KEY') or env_value('SUPABASE_ANON_KEY')
    if not base or not key:
        raise SystemExit('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required (environment or .env)')

    schools = fetch_all(base, key, 'school_master', 'school_id,school_name,road_address,grade1_students')
    layers = {
        'dismissal': {r['school_id'] for r in fetch_all(base, key, 'school_day_estimates', 'school_id')},
        'care_hours': {r['school_id'] for r in fetch_all(base, key, 'school_care_hours', 'school_id')},
        'afterschool': {r['school_id'] for r in fetch_all(base, key, 'school_afterschool_summary', 'school_id')},
    }
    stage_of = {key: stage for key, stage, _ in AREAS} | {'wirye': 1}

    entries = []
    for school in schools:
        area = area_of(school)
        if not area:
            continue
        sid = school['school_id']
        has = {layer: sid in ids for layer, ids in layers.items()}
        entries.append({
            'school_id': sid,
            'school_name': school['school_name'],
            'road_address': school.get('road_address'),
            'grade1_students': school.get('grade1_students'),
            'area': area,
            'wirye': is_wirye(school),
            'stage': stage_of[area],
            'operating_pilot': area in OPERATING_PILOT or is_wirye(school),
            'has': has,
            'missing': [layer for layer, present in has.items() if not present],
        })
    entries.sort(key=lambda e: (e['stage'], e['area'], e['school_name']))

    summary: dict[str, dict] = {}
    for entry in entries:
        row = summary.setdefault(entry['area'], {'stage': entry['stage'], 'schools': 0, 'grade1': 0,
                                                 'missing': {layer: 0 for layer in layers}})
        row['schools'] += 1
        row['grade1'] += int(entry['grade1_students'] or 0)
        for layer in entry['missing']:
            row['missing'][layer] += 1
    return {
        'generated': date.today().isoformat(),
        'decision': DECISION,
        'source': 'public contract via anon key: school_master, school_day_estimates, school_care_hours, school_afterschool_summary',
        'summary': summary,
        'schools': entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--dry-run', action='store_true', help='print the summary, write nothing')
    args = parser.parse_args()
    manifest = build()
    total = len(manifest['schools'])
    print(f"schools {total}, operating pilot {sum(e['operating_pilot'] for e in manifest['schools'])}")
    for area, row in manifest['summary'].items():
        print(f"  stage {row['stage']} {area:12} schools {row['schools']:3} grade1 {row['grade1']:6} missing {row['missing']}")
    if args.dry_run:
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"pilot_manifest_{manifest['generated'].replace('-', '')}.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
