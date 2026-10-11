"""Download and text-extract a probe's 2-가 and 15-라 attachments ahead of the two audits.

The audits handle one file at a time, and a long PDF takes 15-40 s to extract, so a region of
1,300 schools would take most of a day. This fills the same archive, text cache and source index
the audits read (`_cached`, REUSE_TEXT), with a few polite concurrent downloads and extraction
spread over CPU cores; the audits then run from cache. Only this process writes the index, so
do not run an audit at the same time.

    python -m etl.prefetch_schoolinfo_documents --probe docs/research/audit2/schoolinfo_disclosure_probe_wave3_gyeonggi_20261010.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import ARCHIVE, SOURCE_INDEX, TEXT_DIR, _download, _key
from etl.school_document_text import extract_text, file_format


def _extract(path: str) -> tuple[str, str]:
    # workers read the archived file themselves, so a download backlog never sits in memory
    return extract_text(Path(path).read_bytes())


def tasks(probe: dict, index: dict) -> list[tuple[dict, dict, str]]:
    pending = []
    for school in probe['schools']:
        for item in ('curriculum', 'afterschool'):
            for attachment in school['items'].get(item, {}).get('attachments', []):
                if item == 'curriculum' and attachment.get('kind') == 'academic_calendar':
                    continue  # the clock audit skips these too
                digest = index.get(_key(school, attachment, item))
                if digest and (TEXT_DIR / f'{digest}.txt').exists() and any(ARCHIVE.glob(f'{digest}.*')):
                    continue
                pending.append((school, attachment, item))
    return pending


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--probe', required=True)
    parser.add_argument('--downloads', type=int, default=3, help='concurrent downloads (keep small; public site)')
    parser.add_argument('--workers', type=int, default=8, help='text-extraction processes')
    args = parser.parse_args()
    probe = json.loads(Path(args.probe).read_text(encoding='utf-8'))
    index = json.loads(SOURCE_INDEX.read_text(encoding='utf-8')) if SOURCE_INDEX.exists() else {}
    todo = tasks(probe, index)
    print(json.dumps({'to_fetch': len(todo)}), flush=True)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    TEXT_DIR.mkdir(parents=True, exist_ok=True)

    def fetch(task):
        school, attachment, item = task
        data = _download(school, attachment, item)
        time.sleep(0.5)
        return task, data

    done = failed = 0
    started = time.time()
    with ThreadPoolExecutor(args.downloads) as downloads, ProcessPoolExecutor(args.workers) as extractors:
        extracting = {}
        for future in as_completed([downloads.submit(fetch, t) for t in todo]):
            try:
                task, data = future.result()
            except Exception as error:  # the audit will retry and record the failure
                failed += 1
                print(json.dumps({'download_failed': type(error).__name__}), flush=True)
                continue
            digest = hashlib.sha256(data).hexdigest()
            kind = file_format(data)
            archived = ARCHIVE / f'{digest}.{kind if kind != "unknown" else "bin"}'
            archived.write_bytes(data)
            index[_key(task[0], task[1], task[2])] = digest
            if len(index) % 200 == 0:
                SOURCE_INDEX.write_text(json.dumps(index, indent=1), encoding='utf-8')
            if (TEXT_DIR / f'{digest}.txt').exists():
                done += 1
            elif digest not in extracting.values():
                extracting[extractors.submit(_extract, str(archived))] = digest
        for future in as_completed(extracting):
            digest = extracting[future]
            try:
                _, text = future.result()
                (TEXT_DIR / f'{digest}.txt').write_text(text, encoding='utf-8')
                done += 1
            except Exception as error:  # broken or unsupported file: leave it to the audit to record
                failed += 1
                print(json.dumps({'extract_failed': type(error).__name__}), flush=True)
            if done % 100 == 0:
                print(json.dumps({'done': done, 'minutes': round((time.time() - started) / 60, 1)}), flush=True)
    SOURCE_INDEX.write_text(json.dumps(index, indent=1), encoding='utf-8')
    print(json.dumps({'done': done, 'failed': failed, 'minutes': round((time.time() - started) / 60, 1)}), flush=True)


if __name__ == '__main__':
    main()
