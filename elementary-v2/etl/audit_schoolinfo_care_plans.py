"""A2-R02: 돌봄 운영 candidates from each PoC school's 학교알리미 15-라 방과후·돌봄 plan.

Downloads the 15-라 attachments listed in the disclosure probe (public GET, bytes kept under the
git-ignored runtime archive), extracts text locally and collects, from lines that mention
돌봄/늘봄 only:
  * afternoon care end times   (a range ending 16:00-20:30)
  * morning care ranges        (a range ending by 09:10)
  * evening care               (a 저녁 line, or a range ending after 19:00)
  * grade ranges written next to 돌봄 ("1~2학년")
Values are review candidates with the line they came from, never published as found.

    python -m etl.audit_schoolinfo_care_plans
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import ARCHIVE, TIME_RANGE, fetch_text

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'docs/research/audit2/schoolinfo_disclosure_probe_20261006.json'
OUT = ROOT / 'docs/research/audit2/schoolinfo_care_plan_audit_20261007.json'
CARE = re.compile(r'돌\s*봄|늘\s*봄')
GRADES = re.compile(r'(?:초\s*)?([1-6])\s*[~∼\-–,·]\s*([1-6])\s*학\s*년')


def _hhmm(hours: str, mins: str) -> str:
    return f'{int(hours):02d}:{mins}'


def care_candidates(text: str) -> dict:
    lines = text.splitlines()
    afternoon, morning, evening, grades = Counter(), Counter(), [], Counter()
    evidence = []
    for number, line in enumerate(lines, 1):
        if not CARE.search(line):
            continue
        for match in GRADES.finditer(line):
            grades[f'{match.group(1)}~{match.group(2)}'] += 1
        for span in TIME_RANGE.finditer(line):
            start, end = _hhmm(span.group(1), span.group(2)), _hhmm(span.group(3), span.group(4))
            if not start < end:
                continue
            context = line[max(0, span.start() - 40):span.end() + 20]
            if end <= '09:10' and start >= '06:30':
                morning[f'{start}-{end}'] += 1
            elif '저녁' in context or end > '19:00':
                evening.append({'range': f'{start}-{end}', 'line': number})
            elif '16:00' <= end <= '20:30':
                afternoon[end] += 1
            else:
                continue
            if len(evidence) < 12:
                evidence.append({'line': number, 'range': f'{start}-{end}', 'context': context.strip()[:120]})
        # "방과후~19:00" style: an open start
        for match in re.finditer(r'(?:방과\s*후|수업\s*후|하교\s*후|종료\s*후)\s*[~∼]\s*(\d{1,2})\s*:\s*(\d{2})', line):
            end = _hhmm(match.group(1), match.group(2))
            if '16:00' <= end <= '20:30':
                afternoon[end] += 1
                if len(evidence) < 12:
                    evidence.append({'line': number, 'range': f'방과후-{end}', 'context': line[max(0, match.start() - 30):match.end() + 20].strip()[:120]})
    return {
        'afternoon_end_candidates': dict(afternoon.most_common(4)),
        'morning_candidates': dict(morning.most_common(3)),
        'evening_mentions': evening[:4],
        'grade_mentions': dict(grades.most_common(4)),
        'evidence': evidence,
    }


def main() -> None:
    probe = json.loads(PROBE.read_text(encoding='utf-8'))
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    schools = []
    for school in probe['schools']:
        record = {'school_id': school['school_id'], 'school_name': school['school_name'], 'region': school['region'], 'files': []}
        for attachment in school['items']['afterschool'].get('attachments', []):
            entry = {'name': attachment['name'], 'file_academic_year': attachment.get('file_academic_year')}
            try:
                fetched = fetch_text(school, attachment, 'afterschool')
                text = fetched.pop('text')
                entry.update(fetched, text_chars=len(text), **care_candidates(text))
                entry['status'] = ('unreadable' if len(text.strip()) < 200 else
                                   'care_hours_found' if entry['afternoon_end_candidates'] else 'no_care_hours_detected')
            except Exception as error:  # xls/xlsx and broken files: record and continue
                entry.update(status='failed', error=type(error).__name__)
            record['files'].append(entry)
        statuses = [f['status'] for f in record['files']]
        record['status'] = ('no_attachment' if not statuses else 'care_hours_found' if 'care_hours_found' in statuses
                            else 'no_care_hours_detected' if 'no_care_hours_detected' in statuses else 'unreadable')
        record['stale_file_year'] = any(f.get('file_academic_year') == 2025 for f in record['files'])
        schools.append(record)
    summary = Counter(s['status'] for s in schools)
    OUT.write_text(json.dumps({'schema_version': 'schoolinfo-care-plan-audit-v1', 'checked_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                               'source': '학교알리미 15-라 2026년 5월 공시 첨부', 'method': 'local text extraction + regex on 돌봄/늘봄 lines; candidates, not reviewed',
                               'no_operational_upload': True, 'school_count': len(schools), 'summary': dict(summary), 'schools': schools},
                              ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(summary), ensure_ascii=False))


if __name__ == '__main__':
    main()
