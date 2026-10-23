"""Report all local input failures without restoring, packaging or uploading."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from etl.prepare_portable_inputs import PROJECT_DIR, load_manifest, sha256


DEFAULT_MANIFEST = Path(__file__).with_name("pivot_input_baseline_20261023.json")
ALL_MANIFESTS = (
    DEFAULT_MANIFEST,
    Path(__file__).with_name("portable_inputs_manifest.json"),
    Path(__file__).with_name("recurring_inputs_manifest.json"),
)


def inspect_inputs(manifest_path: Path, project_dir: Path = PROJECT_DIR) -> dict:
    manifest, files = load_manifest(manifest_path)
    results = []
    for item in files:
        source = Path(item["source_path"])
        if not source.is_absolute():
            source = project_dir / source
        result = {"role": item["role"], "source_path": item["source_path"]}
        try:
            if not source.exists():
                result.update(status="missing")
            elif not source.is_file():
                result.update(status="not_file")
            else:
                size = source.stat().st_size
                digest = sha256(source)
                issues = []
                if size != int(item["byte_size"]):
                    issues.append("size_mismatch")
                if digest != str(item["sha256"]).lower():
                    issues.append("checksum_mismatch")
                result.update(
                    status="changed" if issues else "ok", issues=issues,
                    actual_byte_size=size, actual_sha256=digest,
                    expected_byte_size=int(item["byte_size"]),
                    expected_sha256=str(item["sha256"]).lower(),
                )
        except OSError as error:
            result.update(status="unreadable", error_type=type(error).__name__)
        results.append(result)
    return {
        "baseline": manifest["bundle_version"],
        "ok": all(result["status"] == "ok" for result in results),
        "files": results,
    }


def inspect_manifests(paths: list[Path], project_dir: Path = PROJECT_DIR) -> dict:
    reports = []
    expectations: dict[str, set[tuple[int, str]]] = {}
    for path in paths:
        try:
            report = inspect_inputs(path, project_dir)
            _, files = load_manifest(path)
            for item in files:
                source = (project_dir / item["source_path"]).resolve()
                expectations.setdefault(str(source), set()).add(
                    (int(item["byte_size"]), str(item["sha256"]).lower())
                )
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            report = {"ok": False, "error": "invalid_manifest", "error_type": type(error).__name__}
        reports.append({"manifest": str(path), **report})
    conflicts = [path for path, values in expectations.items() if len(values) > 1]
    return {
        "ok": all(report["ok"] for report in reports) and not conflicts,
        "unique_input_count": len(expectations),
        "baseline_conflicts": conflicts,
        "manifests": reports,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    group.add_argument("--all", action="store_true", help="Check the local, portable and recurring input manifests")
    args = parser.parse_args(argv)
    try:
        report = inspect_manifests(list(ALL_MANIFESTS)) if args.all else inspect_inputs(args.manifest)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(json.dumps({"ok": False, "error": "invalid_manifest", "error_type": type(error).__name__}))
        return 2
    print(json.dumps(report, ensure_ascii=True, indent=2))
    if args.all and any("error" in item for item in report["manifests"]):
        return 2
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
