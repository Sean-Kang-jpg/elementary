import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from etl import run_portable_readonly_build


class PortableReadonlyBuildTest(unittest.TestCase):
    def test_materializes_every_required_role(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            restore_dir = root / "restore"
            files = []
            for index, role in enumerate(run_portable_readonly_build.ROLE_TARGETS):
                bundle_path = f"inputs/{index}.txt"
                source = restore_dir / bundle_path
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text(role, encoding="utf-8")
                files.append({
                    "role": role,
                    "bundle_path": bundle_path,
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                })

            paths = run_portable_readonly_build.materialize_inputs(
                {"files": files},
                restore_dir,
                project_dir=root / "checkout" / "elementary-v2",
                workspace_root=root / "workspace",
            )

            self.assertEqual(len(paths), len(run_portable_readonly_build.ROLE_TARGETS))
            self.assertTrue((root / "workspace/archive/GAS/GAS/임시/apt_mst_info_202410.csv").is_file())
            self.assertTrue((root / "checkout/elementary-v2/etl/local_outputs_20260320/kapt_basic_20260904.csv").is_file())

    def test_rejects_incomplete_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            with self.assertRaisesRegex(ValueError, "missing roles"):
                run_portable_readonly_build.materialize_inputs(
                    {"files": []},
                    Path(temporary_directory),
                )

    def test_compares_rows_and_checksums(self) -> None:
        report = {
            "audit_check_count": 2,
            "files": [{"name": "output.json", "rows": 3, "sha256": "abc"}],
        }
        baseline = {
            "audit_check_count": 2,
            "files": [{"name": "output.json", "rows": 3, "sha256": "abc"}],
        }
        self.assertEqual(
            run_portable_readonly_build.compare_with_baseline(report, baseline),
            [],
        )
        baseline["files"][0]["rows"] = 4
        self.assertRegex(
            run_portable_readonly_build.compare_with_baseline(report, baseline)[0],
            "rows",
        )

    def test_json_content_checksum_ignores_formatting(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            compact = root / "compact.json"
            pretty = root / "pretty.json"
            value = [{"school_id": "A", "students": 80}]
            compact.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
            pretty.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\r\n")
            self.assertEqual(
                run_portable_readonly_build.content_sha256(compact),
                run_portable_readonly_build.content_sha256(pretty),
            )


if __name__ == "__main__":
    unittest.main()
