"""Materialize a restored ETL bundle and reproduce operational outputs without DB writes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
ETL_DIR = PROJECT_DIR / "etl"
OUTPUT_DIR = ETL_DIR / "local_outputs_20260320"
WORKSPACE_ROOT = PROJECT_DIR.parents[1]
DEFAULT_BASELINE = ETL_DIR / "portable_readonly_baseline.json"

ROLE_TARGETS = {
    "apartment-base": ("workspace", "archive/GAS/GAS/임시/apt_mst_info_202410.csv"),
    "kapt-basic": ("output", "kapt_basic_20260904.csv"),
    "reviewed-school-baseline": ("output", "school_master_v1_20260320.json"),
    "schoolinfo-basic": ("output", "schoolinfo_2026_basic_capital.json"),
    "schoolinfo-grade-students": ("output", "schoolinfo_2026_grade_students_capital.json"),
    "reviewed-assignment-baseline": ("output", "apartment_point_assignments.csv"),
    "assignment-review-queue": ("output", "assignment_review_queue.csv"),
    "assignment-review-resolutions": ("output", "p1_resolved_cases.csv"),
}

BUILD_SCRIPTS = (
    "build_apartment_master_v1.py",
    "build_school_master_v2.py",
    "build_operational_masters.py",
    "audit_operational_backend.py",
)

RESULT_FILES = (
    "school_master_operational_v1.json",
    "apartment_complex_master_v1.json",
    "apartment_assignment_units_v1.json",
    "apartment_assignment_schools_v1.json",
    "school_apartment_serving_v1.json",
    "apartment_name_history_operational_v1.csv",
    "apartment_property_history_operational_v1.csv",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def materialize_inputs(
    manifest: dict,
    restore_dir: Path,
    project_dir: Path = PROJECT_DIR,
    workspace_root: Path = WORKSPACE_ROOT,
) -> list[Path]:
    output_dir = project_dir / "etl" / "local_outputs_20260320"
    expected_roles = set(ROLE_TARGETS)
    actual_roles = {item["role"] for item in manifest["files"]}
    missing_roles = sorted(expected_roles - actual_roles)
    if missing_roles:
        raise ValueError(f"portable bundle is not build-complete; missing roles: {missing_roles}")

    materialized = []
    for item in manifest["files"]:
        role = item["role"]
        if role not in ROLE_TARGETS:
            continue
        source = restore_dir / item["bundle_path"]
        if not source.is_file() or sha256(source) != item["sha256"]:
            raise ValueError(f"restored input is missing or invalid: {role}")
        root_name, relative_target = ROLE_TARGETS[role]
        root = workspace_root if root_name == "workspace" else output_dir
        target = root / relative_target
        if target.exists() and sha256(target) != item["sha256"]:
            raise ValueError(f"refusing to overwrite a different input: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(source, target)
        materialized.append(target)
    return materialized


def row_count(path: Path) -> int:
    if path.suffix == ".json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list):
            raise ValueError(f"expected a JSON row array: {path}")
        return len(value)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def run_build(project_dir: Path = PROJECT_DIR) -> None:
    etl_dir = project_dir / "etl"
    for script in BUILD_SCRIPTS:
        print(f"running {script}")
        subprocess.run([sys.executable, str(etl_dir / script)], cwd=project_dir, check=True)


def compare_with_baseline(report: dict, baseline: dict) -> list[str]:
    differences = []
    if report["audit_check_count"] != baseline["audit_check_count"]:
        differences.append(
            f"audit_check_count: {report['audit_check_count']} != {baseline['audit_check_count']}"
        )
    actual_files = {item["name"]: item for item in report["files"]}
    expected_files = {item["name"]: item for item in baseline["files"]}
    if actual_files.keys() != expected_files.keys():
        differences.append("result file names differ from the baseline")
    for name in sorted(actual_files.keys() & expected_files.keys()):
        for field in ("rows", "sha256"):
            if actual_files[name][field] != expected_files[name][field]:
                differences.append(
                    f"{name} {field}: {actual_files[name][field]} != {expected_files[name][field]}"
                )
    return differences


def write_comparison_report(
    output_dir: Path = OUTPUT_DIR,
    baseline_path: Path = DEFAULT_BASELINE,
) -> Path:
    audit_path = output_dir / "backend_audit_report.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if audit.get("status") != "pass":
        raise RuntimeError("portable read-only build audit did not pass")
    files = []
    for name in RESULT_FILES:
        path = output_dir / name
        files.append({
            "name": name,
            "rows": row_count(path),
            "byte_size": path.stat().st_size,
            "sha256": sha256(path),
        })
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read-only",
        "audit_status": audit["status"],
        "audit_check_count": audit["check_count"],
        "row_counts": audit["row_counts"],
        "files": files,
    }
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    differences = compare_with_baseline(report, baseline)
    report["baseline"] = {
        "name": baseline["baseline_name"],
        "bundle_name": baseline["bundle_name"],
        "bundle_version": baseline["bundle_version"],
        "match": not differences,
        "differences": differences,
    }
    report_path = output_dir / "portable_readonly_build_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if differences:
        raise RuntimeError("portable build differs from the Windows baseline")
    return report_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--restore-dir", type=Path, required=True)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=ETL_DIR / "portable_inputs_manifest.json",
    )
    parser.add_argument("--materialize-only", action="store_true")
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    args = parser.parse_args()
    manifest = load_manifest(args.manifest)
    paths = materialize_inputs(manifest, args.restore_dir)
    print(f"materialized {len(paths)} build inputs")
    if not args.materialize_only:
        run_build()
        write_comparison_report(baseline_path=args.baseline)


if __name__ == "__main__":
    main()
