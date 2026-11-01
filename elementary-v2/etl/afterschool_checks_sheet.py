"""People's work list for SQL 38 school_afterschool_checks, and the way their answers reach the database.

export   unresolved checks -> etl/runtime/afterschool_checks/afterschool_checks_<date>.csv (UTF-8 BOM, opens in
         Excel), one row per item with the school's 15-라 page. A person asks the school or reads the page and
         writes the date in 확인일.
resolve  rows with a 확인일 -> resolved_on (dry-run unless --apply). The card stops showing a resolved item.
         An answer that changes a time is not a resolution: correct the extraction and reload instead.
         load_school_afterschool carries resolved_on across reloads (carry_resolved).

    python -m etl.afterschool_checks_sheet export
    python -m etl.afterschool_checks_sheet resolve etl/runtime/afterschool_checks/afterschool_checks_20261101.csv --apply
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote

from etl.build_afterschool_review_sheet import item_link, probe_index

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'etl/runtime/afterschool_checks'
WEEKDAYS = '월화수목금'
# The card's wording (src/components/school/AfterschoolSummary.tsx CHECK_LABELS)
LABELS = {
    '맞춤형시각없음': '맞춤형 시간이 운영계획에 없어요',
    '원문불일치': '운영계획 안에서 시간·요일이 서로 달라요',
    'PDF원문': '원문이 PDF라 자동 정리가 틀릴 수 있어요',
    '방과후시각미확인': '방과후 일부 강좌 시간이 적혀 있지 않아요',
    '돌봄내분류확인': '돌봄 안에서 하는 프로그램인지 확인이 필요해요',
    '맞춤형미확정행': '맞춤형 일부가 아직 정해지지 않았어요',
    '조건부개설미확인': '인원 등 개설 조건이 있어요',
    '교시요일배정미확인': '교시 기준 시간을 일부 요일에 맞추지 못했어요',
}
# One line per school for the inquiry (a phone call or a message to the school). Items the school cannot
# answer (PDF원문: compare the extraction with the PDF ourselves) stay out of the question text.
QUESTION_HEADER = ['school_id', 'school_name', 'address', '항목 수', '질문', '내부 확인', '15-라 링크', '확인일', '메모']
INTERNAL = {'PDF원문'}
HEADER = ['school_id', 'school_name', 'address', 'seq', 'reason', '사유', '요일', '세부', '15-라 링크', '확인일', '메모']
DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def read_all(rest, url: str, key: str, path: str) -> list[dict]:
    rows, offset = [], 0
    while True:
        page, _ = rest(url, key, f'{path}&limit=1000&offset={offset}')
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def sheet_rows(checks: list[dict], schools: dict[str, dict], probes: dict[str, dict]) -> list[dict]:
    out = []
    for c in sorted(checks, key=lambda c: (c['school_id'], c['seq'])):
        school = schools.get(c['school_id'], {})
        probe = probes.get(c['school_id'])
        out.append({'school_id': c['school_id'], 'school_name': school.get('school_name', ''),
                    'address': school.get('road_address') or '', 'seq': c['seq'], 'reason': c['reason'],
                    '사유': LABELS.get(c['reason'], c['reason']), '요일': WEEKDAYS[c['weekday'] - 1] if c.get('weekday') else '',
                    '세부': c.get('detail') or '', '15-라 링크': item_link(probe) if probe else '', '확인일': '', '메모': ''})
    return out


def detail_names(detail: str) -> list[str]:
    """Course names out of a check detail; line numbers and row indexes are for reviewers, not schools."""
    parts = [p.strip() for p in detail.split('·')] if detail else []
    return [p for p in parts if p and p not in ('시각', '요일', '학년') and not re.fullmatch(r'(L\d+[\s/L\d]*|\d+)', p)]


def school_questions(rows: list[dict]) -> list[dict]:
    by_school: dict[str, list[dict]] = {}
    for row in rows:
        by_school.setdefault(row['school_id'], []).append(row)
    out = []
    for sid, items in by_school.items():
        def days(reason):
            found = {i['요일'] for i in items if i['reason'] == reason and i['요일']}
            return '·'.join(d for d in WEEKDAYS if d in found)
        def names(reason):
            return ', '.join(dict.fromkeys(' '.join(detail_names(i['세부'])) for i in items
                                           if i['reason'] == reason and detail_names(i['세부'])))
        reasons = {i['reason'] for i in items}
        asks = []
        if '맞춤형시각없음' in reasons:
            custom_days = days('맞춤형시각없음')
            asks.append(f'1학년 맞춤형 프로그램의 요일별 운영 시간(시작~끝){f" ({custom_days})" if custom_days else ""}')
        if '방과후시각미확인' in reasons:
            asks.append(f"요일·시간이 운영계획에 없는 방과후 강좌의 시간: {names('방과후시각미확인') or '목록 확인'}")
        if '원문불일치' in reasons:
            asks.append(f"운영계획 안에서 시간이 서로 다르게 적힌 강좌의 실제 시간: {names('원문불일치') or '목록 확인'}")
        if '맞춤형미확정행' in reasons:
            asks.append('미정으로 적힌 맞춤형 프로그램의 확정 내용과 시간')
        if '조건부개설미확인' in reasons:
            asks.append('인원 등 조건이 붙은 강좌의 실제 개설 여부')
        if '교시요일배정미확인' in reasons:
            asks.append('1학년 요일별 수업 교시(4교시·5교시)')
        if '돌봄내분류확인' in reasons:
            asks.append(f"돌봄교실 안에서만 하는 프로그램인지: {names('돌봄내분류확인') or '목록 확인'}")
        first = items[0]
        out.append({'school_id': sid, 'school_name': first['school_name'], 'address': first['address'], '항목 수': len(items),
                    '질문': ' / '.join(f'{n}. {a}' for n, a in enumerate(asks, 1)),
                    '내부 확인': ', '.join(sorted(reasons & INTERNAL)), '15-라 링크': first['15-라 링크'], '확인일': '', '메모': ''})
    return out


def resolutions(path: Path) -> list[dict]:
    """Rows a person dated. A malformed date stops the run rather than being skipped."""
    out = []
    with path.open(encoding='utf-8-sig', newline='') as handle:
        for row in csv.DictReader(handle):
            when = (row.get('확인일') or '').strip()
            if not when:
                continue
            if not DAY.match(when):
                raise ValueError(f"확인일 must be YYYY-MM-DD: {row['school_id']} seq {row['seq']} '{when}'")
            out.append({'school_id': row['school_id'], 'seq': int(row['seq']), 'reason': row['reason'], 'resolved_on': when})
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('export')
    resolve = sub.add_parser('resolve')
    resolve.add_argument('csv', type=Path)
    resolve.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    from etl.collect_care_data import credentials, rest
    url, service_key, _ = credentials()
    if args.command == 'export':
        checks = read_all(rest, url, service_key,
                          'school_afterschool_checks?select=school_id,seq,reason,weekday,detail&resolved_on=is.null&order=school_id,seq')
        ids = sorted({c['school_id'] for c in checks})
        schools = {}
        for start in range(0, len(ids), 100):
            page, _ = rest(url, service_key, f"school_master?select=school_id,school_name,road_address&school_id=in.({','.join(ids[start:start + 100])})")
            schools.update({s['school_id']: s for s in page})
        rows = sheet_rows(checks, schools, probe_index())
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        out = OUT_DIR / f'afterschool_checks_{date.today().strftime("%Y%m%d")}.csv'
        with out.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=HEADER)
            writer.writeheader()
            writer.writerows(rows)
        questions = OUT_DIR / f'afterschool_school_questions_{date.today().strftime("%Y%m%d")}.csv'
        with questions.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=QUESTION_HEADER)
            writer.writeheader()
            writer.writerows(school_questions(rows))
        print(json.dumps({'file': str(out.relative_to(ROOT)), 'questions': str(questions.relative_to(ROOT)), 'items': len(rows), 'schools': len(ids),
                          'without_link': sum(not r['15-라 링크'] for r in rows)}, ensure_ascii=False))
        return
    items = resolutions(args.csv)
    matched, unmatched = 0, []
    for item in items:
        # reason in the filter: a sheet exported before a reload must not close a different item that took its seq
        path = (f"school_afterschool_checks?school_id=eq.{item['school_id']}&seq=eq.{item['seq']}"
                f"&reason=eq.{quote(item['reason'])}")
        if args.apply:
            page, _ = rest(url, service_key, path, method='PATCH', data={'resolved_on': item['resolved_on']},
                           headers={'Prefer': 'return=representation'})
        else:
            page, _ = rest(url, service_key, f'{path}&select=seq')
        if page:
            matched += 1
        else:
            unmatched.append(f"{item['school_id']}#{item['seq']}")
    print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'dated': len(items), 'matched': matched,
                      'unmatched': unmatched}, ensure_ascii=False))


if __name__ == '__main__':
    main()
