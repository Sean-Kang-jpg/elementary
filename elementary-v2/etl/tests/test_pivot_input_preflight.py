import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.pivot_input_preflight import inspect_inputs, inspect_manifests, main


class PivotInputPreflightTest(unittest.TestCase):
    def make_manifest(self, root, names):
        files = [{
            "role": name, "source_path": name, "bundle_path": name,
            "byte_size": 4, "sha256": hashlib.sha256(b"good").hexdigest(),
        } for name in names]
        path = root / "manifest.json"
        path.write_text(json.dumps({"bundle_version": "fixture", "files": files}), encoding="utf-8")
        return path

    def test_reports_every_failure_and_preserves_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ok").write_bytes(b"good")
            (root / "changed").write_bytes(b"evil")
            (root / "short").write_bytes(b"x")
            (root / "folder").mkdir()
            manifest = self.make_manifest(root, ["ok", "missing", "changed", "short", "folder"])
            before = {p.name: p.read_bytes() for p in root.iterdir() if p.is_file()}
            report = inspect_inputs(manifest, root)
            self.assertFalse(report["ok"])
            self.assertEqual([r["status"] for r in report["files"]],
                             ["ok", "missing", "changed", "changed", "not_file"])
            self.assertEqual(report["files"][2]["issues"], ["checksum_mismatch"])
            self.assertEqual(report["files"][3]["issues"], ["size_mismatch", "checksum_mismatch"])
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir() if p.is_file()})
            self.assertFalse((root / "missing").exists())

    def test_read_failure_does_not_hide_other_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "locked").write_bytes(b"good")
            manifest = self.make_manifest(root, ["locked", "missing"])
            with patch("etl.pivot_input_preflight.sha256", side_effect=PermissionError):
                report = inspect_inputs(manifest, root)
            self.assertEqual([r["status"] for r in report["files"]], ["unreadable", "missing"])

    def test_cli_status_codes_and_json(self):
        for ok, expected in [(True, 0), (False, 1)]:
            with self.subTest(ok=ok), patch("etl.pivot_input_preflight.inspect_inputs", return_value={"ok": ok}):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertEqual(main([]), expected)
                self.assertEqual(json.loads(output.getvalue())["ok"], ok)
        with patch("etl.pivot_input_preflight.inspect_inputs", side_effect=ValueError), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main([]), 2)
        self.assertEqual(json.loads(output.getvalue())["error"], "invalid_manifest")

    def test_rejects_empty_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = self.make_manifest(Path(directory), [])
            with self.assertRaises(ValueError):
                inspect_inputs(manifest)

    def test_combines_manifests_and_detects_conflicting_baselines(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source").write_bytes(b"good")
            first = self.make_manifest(root, ["source"])
            second = root / "second.json"
            second.write_bytes(first.read_bytes())
            report = inspect_manifests([first, second], root)
            self.assertTrue(report["ok"])
            self.assertEqual(report["unique_input_count"], 1)
            content = json.loads(second.read_text(encoding="utf-8"))
            content["files"][0]["sha256"] = "0" * 64
            second.write_text(json.dumps(content), encoding="utf-8")
            report = inspect_manifests([first, second], root)
            self.assertFalse(report["ok"])
            self.assertEqual(report["baseline_conflicts"], [str((root / "source").resolve())])

    def test_bad_manifest_does_not_hide_other_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            valid = self.make_manifest(root, ["missing"])
            bad = root / "bad.json"
            bad.write_text("{", encoding="utf-8")
            report = inspect_manifests([bad, valid], root)
            self.assertFalse(report["ok"])
            self.assertEqual(report["manifests"][0]["error"], "invalid_manifest")
            self.assertEqual(report["manifests"][1]["files"][0]["status"], "missing")
            with patch("etl.pivot_input_preflight.ALL_MANIFESTS", (bad, valid)), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--all"]), 2)


if __name__ == "__main__":
    unittest.main()
