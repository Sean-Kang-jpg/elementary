"""Read-only course-label audit; candidates are not confirmed enrolment eligibility.

Run from elementary-v2: python etl/profile_academy_grade_evidence.py SNAPSHOT OUTPUT
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

FIELDS = ("LE_CRSE_LIST_NM", "LE_CRSE_NM", "PSNBY_THCC_CNTNT")
PATTERNS = {
    "elementary_label": r"초등",
    "lower_grade_label": r"(?:초등\s*)?저학년",
    "grade1_candidate": r"초등\s*1\s*학년|초등학교\s*1\s*학년|(?<![가-힣])초\s*1(?!\d)",
    "ambiguous_grade1": r"1\s*학년",
    "beginner_not_grade": r"초급",
}


def profile(rows: list[dict]) -> dict:
    eligible = [r for r in rows if r.get("REALM_SC_NM") != "직업기술"]
    compiled = {k: re.compile(v) for k, v in PATTERNS.items()}
    metrics = {}
    for name, pattern in compiled.items():
        matched = [r for r in eligible if any(pattern.search(r.get(f) or "") for f in FIELDS)]
        metrics[name] = {
            "count": len(matched),
            "by_region": dict(sorted(Counter(r.get("_region", "") for r in matched).items())),
            "by_field": {f: sum(bool(pattern.search(r.get(f) or "")) for r in eligible) for f in FIELDS},
            "examples": [{"institution_key": f"neis:{r.get('ATPT_OFCDC_SC_CODE')}-{r.get('ACA_ASNUM')}",
                          "name": r.get("ACA_NM"), "region": r.get("_region"),
                          "evidence": {f: r[f] for f in FIELDS if pattern.search(r.get(f) or "")}}
                         for r in matched[:12]],
        }
    keys = [(r.get("ATPT_OFCDC_SC_CODE"), r.get("ACA_ASNUM")) for r in eligible]
    return {
        "source_rows": len(rows), "serving_scope_rows": len(eligible),
        "unique_institution_keys": len(set(keys)),
        "excluded_vocational_rows": len(rows) - len(eligible),
        "field_nonempty": {f: sum(bool((r.get(f) or "").strip()) for r in eligible) for f in FIELDS},
        "patterns": PATTERNS, "metrics": metrics,
        "caveat": "Overlapping textual candidate counts, not verified grade-1 eligibility. Beginner labels do not identify age. No shuttle fields in this snapshot.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    raw = args.snapshot.read_bytes()
    result = profile(json.loads(raw.decode("utf-8")))
    result["snapshot"] = args.snapshot.name
    result["snapshot_sha256"] = hashlib.sha256(raw).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rows": result["source_rows"], "scope": result["serving_scope_rows"],
                      "counts": {k: v["count"] for k, v in result["metrics"].items()}}, ensure_ascii=True))


if __name__ == "__main__":
    main()
