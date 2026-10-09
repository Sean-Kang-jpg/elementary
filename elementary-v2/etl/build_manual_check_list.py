"""Schools whose "초1 하루 예상" card is incomplete, with the sources to check them by hand.

One row per school that lacks a grade-1 clock, has weekdays left as 학교 확인, or has no stated
care hours. Each row names why, links the school's 학교알리미 page and the two disclosure items
(2-가 curriculum, 15-라 after-school/care) with their attachment names, and leaves columns for
the values a person reads from the source. Written as CSV (UTF-8 with BOM, opens in Excel).

    python -m etl.build_manual_check_list
"""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

from etl.load_school_day_estimates import REVIEW_SETS

ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
OUT = AUDIT2 / f'manual_check_list_{date.today().strftime("%Y%m%d")}.csv'
ORIGIN = 'https://www.schoolinfo.go.kr'
SCHOOL_PAGE = f'{ORIGIN}/ei/ss/Pneiss_b01_s0.do'
YEAR = '2026'
# Parameters as the school page's own loadGongSi() sends them (scripts/probe-schoolinfo-disclosures.mjs ITEMS).
ITEMS = {
    'curriculum': ('/ei/pp/Pneipp_b14_s0p.do', {'GS_HANGMOK_CD': '14', 'GS_HANGMOK_NO': '2-가', 'GS_HANGMOK_NM': '학교교육과정 편성ㆍ운영 및 평가에 관한 사항',
                                                 'GS_BURYU_CD': 'JG100', 'JG_BURYU_CD': 'JG020', 'JG_HANGMOK_CD': '05', 'JG_GUBUN': '1'}),
    'afterschool': ('/ei/pp/Pneipp_b73_s0p.do', {'GS_HANGMOK_CD': '73', 'GS_HANGMOK_NO': '15-라', 'GS_HANGMOK_NM': '방과후학교 운영 계획 및 운영ㆍ지원현황',
                                                  'GS_BURYU_CD': 'JG130', 'JG_BURYU_CD': 'JG150', 'JG_HANGMOK_CD': '59', 'JG_GUBUN': '1'}),
}
# set name in REVIEW_SETS -> (probe, clock audit, extra source of reasons)
SOURCES = {
    'pilot': ('schoolinfo_disclosure_probe_20261006.json', 'schoolinfo_daily_clock_audit_20261006.json', None),
    'expansion_seongnam_gangnam3': ('schoolinfo_disclosure_probe_expansion_20261008.json', 'schoolinfo_daily_clock_audit_expansion_20261008.json', None),
    'wave2_seoul': ('schoolinfo_disclosure_probe_wave2_seoul_20261009.json', 'schoolinfo_daily_clock_audit_wave2_seoul_20261009.json',
                    'llm_review_overrides_wave2_seoul_20261010.json'),
}
CLOCK_REASON = {
    'no_clock_detected': '2-가 문서에서 시정표를 찾지 못함(요약본이거나 표가 이미지일 수 있음)',
    'clock_heading_only': '시정표 제목만 있고 표 글자가 없음(이미지 표 가능)',
    'unreadable': '2-가 첨부를 읽지 못함(파일 형식)',
    'no_attachment': '2-가 첨부 없음',
}
MANUAL_COLUMNS = ['확인_4교시끝', '확인_점심', '확인_점심위치(4교시앞/뒤)', '확인_5교시끝', '확인_돌봄기본종료', '확인_돌봄연장종료', '확인_출처(파일/쪽)', '확인일', '확인자', '메모']


def _load(name: str) -> dict:
    return json.loads((AUDIT2 / name).read_text(encoding='utf-8'))


def item_url(item: str, shl: str, name: str) -> str:
    path, codes = ITEMS[item]
    return f'{ORIGIN}{path}?' + urlencode({**codes, 'JG_YEAR2': YEAR, 'HG_NM': name, 'SHL_IDF_CD': shl, 'GS_TYPE': 'Y', 'JG_YEAR': YEAR,
                                            'SORT': 'BR', 'CHOSEN_JG_YEAR': YEAR, 'PRE_JG_YEAR': YEAR, 'LOAD_TYPE': 'single'})


def rows_for(review_set: dict) -> list[dict]:
    probe_file, audit_file, override_file = SOURCES[review_set['name']]
    probe = {s['school_id']: s for s in _load(probe_file)['schools']}
    audit = {s['school_id']: s for s in _load(audit_file)['schools']}
    clock_review = _load(review_set['clock'])
    reviewed = {s['school_id'] for s in clock_review['schools']}
    excluded = {s['school_id']: s['reason'] for s in clock_review.get('excluded_no_regular_clock', [])}
    if override_file:
        excluded.update({sid: o['reason'] for sid, o in _load(override_file)['schools'].items() if o.get('clock', 0) is None})
    estimates = {s['school_id']: s for s in _load(review_set['estimates'])['schools']}
    care = {s['school_id']: s for s in _load(review_set['care'])['schools']}
    rows = []
    for school_id in sorted(set(probe) | set(care)):
        clock_issue, care_issue = '', ''
        if school_id not in reviewed:
            status = audit.get(school_id, {}).get('status')
            clock_issue = excluded.get(school_id) or (
                '시정표는 탐지됐으나 1학년 정규 시정을 읽지 못함' if status == 'clock_found' else CLOCK_REASON.get(status, status or '2-가 확인 안 됨'))
        elif school_id in estimates and estimates[school_id]['status'] != 'complete':
            days = [f"{d}({v['periods'] or '?'}교시)" for d, v in estimates[school_id]['days'].items() if v['dismissal'] is None]
            clock_issue = '요일 학교 확인: ' + ', '.join(days) + ' — 1학년 4·5교시가 아닌 날이거나 NEIS 교시 수가 불확실'
        entry = care.get(school_id)
        if entry is None or entry.get('unknown'):
            care_issue = '15-라 계획에 1학년 오후돌봄 종료 시각이 없음' + (f" ({entry['note']})" if entry and entry.get('note') else '')
        if not clock_issue and not care_issue:
            continue
        p = probe.get(school_id, {})
        shl = p.get('shl_idf_cd') or ''
        name = p.get('school_name') or (entry or {}).get('school_name', '')
        attachments = {item: ' / '.join(a['name'] for a in p.get('items', {}).get(item, {}).get('attachments', [])) for item in ITEMS}
        rows.append({
            '세트': review_set['name'], 'school_id': school_id, '학교명': name, '지역': p.get('region') or '',
            '시정_확인필요': clock_issue, '돌봄_확인필요': care_issue,
            '학교알리미_학교페이지': f'{SCHOOL_PAGE}?{urlencode({"SHL_IDF_CD": shl})}' if shl else '',
            '2-가_공시페이지': item_url('curriculum', shl, name) if shl else '', '2-가_첨부': attachments['curriculum'],
            '15-라_공시페이지': item_url('afterschool', shl, name) if shl else '', '15-라_첨부': attachments['afterschool'],
            **{column: '' for column in MANUAL_COLUMNS},
        })
    return rows


def main() -> None:
    rows = [row for review_set in REVIEW_SETS for row in rows_for(review_set)]
    with OUT.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        'schools': len(rows),
        'by_set': dict(Counter(r['세트'] for r in rows)),
        'clock_missing': sum(bool(r['시정_확인필요']) and not r['시정_확인필요'].startswith('요일') for r in rows),
        'weekday_check': sum(r['시정_확인필요'].startswith('요일') for r in rows),
        'care_missing': sum(bool(r['돌봄_확인필요']) for r in rows),
        'both_missing': sum(bool(r['시정_확인필요']) and bool(r['돌봄_확인필요']) for r in rows),
        'out': str(OUT.relative_to(ROOT)),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
