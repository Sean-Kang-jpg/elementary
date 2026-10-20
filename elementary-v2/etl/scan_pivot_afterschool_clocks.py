"""P2 option 1: look for a bell schedule (시정표) in the 15-라 after-school plan of each pilot school
whose 2-가 curriculum attachment has none.

The 15-라 files were already downloaded for the care-hours work, so this reads the local archive
(etl/runtime/audit2-documents, keyed by SHA-256) and runs the same deterministic clock detector
the 2-가 audit uses. Results are candidates for review against the original, never published values.

    python -m etl.scan_pivot_afterschool_clocks
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import clock_blocks, clock_rows, grade1_weekday_periods
from etl.school_document_text import extract_text


ROOT = Path(__file__).resolve().parents[1]
AUDIT2 = ROOT / 'docs/research/audit2'
PIVOT = ROOT / 'docs/research/pivot'
# The archive is git-ignored, so a worktree has none; fall back to the main checkout's copy.
ARCHIVES = [ROOT / 'etl/runtime/audit2-documents', Path('F:/sm/vibe/elementary/pjt_250826/elementary-v2/etl/runtime/audit2-documents')]
CARE_AUDITS = [  # oldest first; the latest wave that lists a school wins
    'schoolinfo_care_plan_audit_20261007.json',
    'schoolinfo_care_plan_audit_expansion_20261008.json',
    'schoolinfo_care_plan_audit_wave2_seoul_20261009.json',
    'schoolinfo_care_plan_audit_wave3_gyeonggi_20261010.json',
]


def document_text(sha: str, fmt: str) -> str | None:
    for archive in ARCHIVES:
        cached = archive / 'text' / f'{sha}.txt'
        if cached.exists():
            return cached.read_text(encoding='utf-8', errors='ignore')
        original = archive / f'{sha}.{fmt}'
        if original.exists():
            return extract_text(original.read_bytes())[1]
    return None


def scan_file(file: dict) -> dict:
    # an audit entry without a digest is an attachment that was listed but never downloaded
    text = document_text(file['sha256'], file.get('format', 'bin')) if file.get('sha256') else None
    if text is None:
        return {'name': file.get('name'), 'sha256': file.get('sha256'), 'status': 'missing'}
    blocks = clock_blocks(clock_rows(text))
    periods = grade1_weekday_periods(text)
    return {
        'name': file.get('name'), 'sha256': file['sha256'], 'format': file['format'], 'text_chars': len(text),
        'file_academic_year': file.get('file_academic_year'),
        'clock_block_count': len(blocks),
        'clock_blocks': blocks,
        'grade1_weekday_periods': periods,
        'status': 'clock_found' if blocks else 'no_clock_detected',
    }


def main() -> None:
    diagnoses = sorted(PIVOT.glob('p2_gap_diagnosis_*.json'))
    if not diagnoses:
        raise SystemExit('run python -m etl.diagnose_pivot_dismissal_gaps first')
    gaps = json.loads(diagnoses[-1].read_text(encoding='utf-8'))['schools']
    care_files: dict[str, list[dict]] = {}
    for name in CARE_AUDITS:
        path = AUDIT2 / name
        if path.exists():
            for school in json.loads(path.read_text(encoding='utf-8'))['schools']:
                care_files[school['school_id']] = school.get('files') or []

    rows = []
    for gap in gaps:
        files = [scan_file(f) for f in care_files.get(gap['school_id'], [])]
        status = ('no_15ra' if gap['school_id'] not in care_files else
                  'no_attachment' if not files else
                  'clock_found' if any(f['status'] == 'clock_found' for f in files) else
                  'missing' if all(f['status'] == 'missing' for f in files) else 'no_clock_detected')
        rows.append({key: gap[key] for key in ('school_id', 'school_name', 'area', 'stage', 'operating_pilot', 'reason')}
                    | {'status': status, 'files': files})

    summary = {
        'all': dict(Counter(r['status'] for r in rows)),
        'operating_pilot': dict(Counter(r['status'] for r in rows if r['operating_pilot'])),
    }
    out = PIVOT / diagnoses[-1].name.replace('p2_gap_diagnosis_', 'p2_afterschool_clock_scan_')
    out.write_text(json.dumps({'source': diagnoses[-1].name, 'summary': summary, 'schools': rows},
                              ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))
    print(f'wrote {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
