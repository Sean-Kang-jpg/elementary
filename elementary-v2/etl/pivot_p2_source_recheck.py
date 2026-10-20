"""Read-only P2 source recheck: 2026 Schoolinfo 2-ga attachment metadata -> original text.

Run from elementary-v2: python -m etl.pivot_p2_source_recheck
No database writes. Never treats inferred dismissal as approved.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from etl.audit_schoolinfo_daily_clock import (
    CLOCK_HEADING, ARCHIVE, TEXT_DIR, clock_blocks, clock_rows, fetch_text
)

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "docs/research/pivot/p2_source_fetch_queue_20261021.json"
OUT = ROOT / "etl/runtime/pivot-p2-source-recheck.json"
KEYWORDS = re.compile(r"시\s*정\s*표|일\s*과\s*표|일과\s*운영|학년별\s*일과|교육활동\s*시간|1\s*학년|4\s*교\s*시|5\s*교\s*시|급\s*식|점\s*심")


def evidence(text: str) -> dict:
    lines = text.splitlines()
    matches = [{"line": i + 1, "excerpt": line.strip()[:180]}
               for i, line in enumerate(lines) if KEYWORDS.search(line)][:30]
    blocks = clock_blocks(clock_rows(text))
    return {
        "text_chars": len(text),
        "heading_detected": bool(CLOCK_HEADING.search(text)),
        "keyword_matches": matches,
        "clock_blocks": [
            [{"label": row["label"], "start": row["start"], "end": row["end"]}
             for row in block[:20]] for block in blocks[:3]
        ],
        "requires_manual_source_review": True,
    }


def run(queue: dict, *, cached_only: bool) -> dict:
    schools = []
    for target in queue["schools"]:
        records = []
        for probe in target["probes"]:
            school = {"shl_idf_cd": probe["shl_idf_cd"]}
            for attachment in probe["attachments"]:
                item = {"file_seq": attachment["file_seq"], "name": attachment["name"]}
                try:
                    if cached_only:
                        from etl.audit_schoolinfo_daily_clock import _cached
                        import hashlib
                        data = _cached(school, item)
                        if data is None:
                            records.append({"name": item["name"], "status": "not_cached"})
                            continue
                        digest = hashlib.sha256(data).hexdigest()
                        path = TEXT_DIR / f"{digest}.txt"
                        if not path.exists():
                            records.append({"name": item["name"], "status": "text_not_cached"})
                            continue
                        source_text = path.read_text(encoding="utf-8")
                        result = {"sha256": digest, "text": source_text}
                    else:
                        result = fetch_text(school, item, "curriculum", year="2026")
                    records.append({"name": item["name"], "status": "candidate_only",
                                    "sha256": result["sha256"], **evidence(result["text"])})
                except Exception as exc:
                    records.append({"name": item["name"], "status": "fetch_or_extract_failed",
                                    "error_type": type(exc).__name__})
        schools.append({"school_id": target["school_id"], "school_name": target["school_name"],
                        "source_files": records, "review_status": "pending_manual_review",
                        "publish_status": "not_approved"})
    return {"schema_version": "pivot-p2-source-recheck-v1", "source_year": 2026,
            "read_only": True, "no_operational_upload": True, "schools": schools}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", type=Path, default=QUEUE)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--download", action="store_true",
                        help="Explicitly allow downloading public Schoolinfo source files; default is cache only")
    args = parser.parse_args()
    queue = json.loads(args.queue.read_text(encoding="utf-8"))
    result = run(queue, cached_only=not args.download)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"schools": len(result["schools"]),
                      "candidate_files": sum(f["status"] == "candidate_only" for s in result["schools"] for f in s["source_files"]),
                      "out": str(args.out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
