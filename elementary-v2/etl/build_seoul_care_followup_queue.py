"""Build a dated, offline review queue; never fetch, publish, or overwrite previews."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from etl.load_school_afterschool import build, table_rows

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'docs/research/audit2'
EXTRACTION = ROOT / 'etl/runtime/llm_extraction'
REPORT = ROOT / 'docs/research/care-followup-20261019'
PROBES = ['schoolinfo_disclosure_probe_20261006.json',
          'schoolinfo_disclosure_probe_expansion_20261008.json',
          'schoolinfo_disclosure_probe_wave2_seoul_20261009.json']


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    schools = {s['school_id']: s for name in PROBES for s in read(AUDIT / name)['schools']
               if s['region'] == '서울특별시'}
    outputs = [EXTRACTION / 'outputs_afterschool' / name
               for name in ['seoul', 'seoul_retry', 'seoul_gap37_reviewed']]
    custom = [EXTRACTION / 'outputs_custom' / name for name in ['seoul', 'seoul_noc']]
    afterschool = [EXTRACTION / 'outputs_afterschool/seoul_noas']
    records, _ = build(outputs, custom, afterschool)
    published = {r['school_id']: r for r in records}
    custom_ids = {r['school_id'] for r in records if r['custom_options'] > 0}
    missing = set(schools) - set(published)
    custom_missing = set(schools) - custom_ids
    rows = table_rows(records, '2026-10-19')
    measured = (len(schools), len(published), len(rows['school_afterschool_programs']),
                len(custom_ids), len(missing), len(custom_missing))
    if measured != (606, 561, 20567, 428, 45, 178):
        raise SystemExit(f'Dated baseline changed: {measured}. Reconcile before regenerating.')

    gap = {s['school_id']: s for s in read(ROOT / 'docs/research/seoul-gap37-20261019/combined_research.json')['schools']}
    # Preserve extractor notes as investigation hints, never as operating status.
    notes: dict[str, list[str]] = {}
    for folder in outputs + afterschool + custom:
        for path in sorted(folder.glob('batch_*.json')):
            for school in read(path):
                note = school.get('note')
                if note and note not in notes.setdefault(school['school_id'], []):
                    notes[school['school_id']].append(note)
    queue = []
    for school_id in sorted(custom_missing):
        school = schools[school_id]
        group = ('gap37_held' if school_id in gap else 'processed_no_public_course') if school_id in missing else 'custom_gap_in_published_school'
        attachments = school.get('items', {}).get('afterschool', {}).get('attachments', [])
        queue.append({
            'school_id': school_id, 'school_name': school['school_name'],
            'group': group, 'priority': 1 if school_id in missing else 2,
            'public_course_data_missing': school_id in missing,
            'custom_data_missing': True, 'operation_status': 'unknown',
            'source_disclosure_year': 2026, 'live_source_rechecked': False,
            'attachment_names': [a['name'] for a in attachments],
            'extraction_notes': notes.get(school_id, []),
            'research_input': gap.get(school_id, {}).get('input_path'),
            'next_action': '원문 학년도·초1 대상·선택 강좌 구분·병합표를 확인하고 이름을 보강. 시간·요일은 직접 근거가 있을 때만 반영.',
        })
    queue.sort(key=lambda s: (s['priority'], s['group'], s['school_id']))
    groups = dict(Counter(s['group'] for s in queue))
    if groups != {'gap37_held': 12, 'processed_no_public_course': 33, 'custom_gap_in_published_school': 133}:
        raise SystemExit(f'Unexpected group split: {groups}')
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT / 'queue.json').write_text(json.dumps({
        'checked_on': '2026-10-19', 'method': 'offline_rebuild_of_published_inputs',
        'db_write': False, 'live_db_rechecked': False,
        'baseline': {'seoul_schools': 606, 'published_schools': 561, 'program_rows': 20567,
                     'custom_schools': 428, 'no_public_courses': 45, 'no_custom_data': 178},
        'groups': groups, 'schools': queue,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    labels = {'gap37_held': '추가 조사 보류',
              'processed_no_public_course': '기존 처리 후 공개 제외',
              'custom_gap_in_published_school': '공개 학교의 맞춤형 공백'}
    lines = ['# 서울 돌봄·강좌 후속 조사 큐 — 2026-10-19', '',
             '승인 입력의 읽기 전용 재빌드로 공개 561개교·20,567행·맞춤형 428개교를 재현했다. 운영 DB를 새로 조회하거나 수정하지 않았다.', '',
             '**1순위: 전체 공개 자료 공백 45개교(보류 12 + 기존 제외 33). 2순위: 공개 학교 안의 맞춤형 공백 133개교.**', '',
             '맞춤형 미확인 178개교에는 위 45개교가 포함된다. 45와 178을 합산하지 않는다. 자료 없음은 미운영을 뜻하지 않는다.', '',
             '이 큐는 원문 보강 대상을 정한 것이다. 학교 조사 완료·실제 운영 확인·새 강좌 확보를 뜻하지 않는다. 기존 추출 메모도 조사 힌트이며 운영 상태 판정이 아니다.', '',
             '[학교별 메모·원문 입력 경로](queue.json). 원문은 2026 공시 캐시이며 최신 게시물을 다시 확인한 것은 아니다.', '',
             '## 1순위: 공개 자료 공백', '', '| 학교 ID | 학교 | 조사 구분 |', '|---|---|---|']
    lines += [f"| {s['school_id']} | {s['school_name']} | {labels[s['group']]} |" for s in queue if s['priority'] == 1]
    lines += ['', '## 조사 절차', '',
              '1. 추가 조사 보류 12개교의 학년도·정규수업/선택활동·초1 대상 근거를 먼저 확인한다.',
              '2. 기존 공개 제외 33개교는 추출 메모와 다른 공시 첨부를 대조해 실제 이름이 빠졌는지 확인한다.',
              '3. 공개 학교의 맞춤형 공백 133개교는 무료 총칭과 실제 프로그램명을 구별한다.',
              '4. 요일·시각·학년이 불명확하면 미확인으로 보존하고, 새 검토 결과는 별도 출력에 남긴다. 기존 승인 입력과 운영 데이터를 덮어쓰지 않는다.', '',
              '재현: `python -m etl.build_seoul_care_followup_queue`. 출력 전 분모·행 수·집합별 학교 수가 날짜 기준선과 맞는지 확인한다.', '']
    (REPORT / 'README.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'groups': groups, 'total_unique_schools': len(queue)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
