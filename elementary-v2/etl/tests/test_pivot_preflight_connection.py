"""Exercise the workflow gate command without network or production writes."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]


class PreflightConnectionTest(unittest.TestCase):
    def test_gate_checks_materialized_bytes_and_returns_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.csv"
            source.write_bytes(b"good")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({
                "bundle_version": "fixture",
                "files": [{
                    "role": "reviewed", "source_path": str(source),
                    "bundle_path": "source.csv", "byte_size": 4,
                    "sha256": hashlib.sha256(b"good").hexdigest(),
                }],
            }), encoding="utf-8")
            for content, expected, status in [(b"good", 0, "ok"), (b"evil", 1, "changed"), (None, 1, "missing")]:
                with self.subTest(status=status):
                    if content is None:
                        source.unlink()
                    else:
                        source.write_bytes(content)
                    result = subprocess.run(
                        [sys.executable, "-m", "etl.pivot_input_preflight", "--manifest", str(manifest)],
                        cwd=PROJECT_DIR, capture_output=True, text=True, check=False,
                    )
                    self.assertEqual(result.returncode, expected, result.stderr)
                    self.assertEqual(json.loads(result.stdout)["files"][0]["status"], status)

    def test_workflow_gate_runs_between_restore_and_due_groups(self):
        workflow = (PROJECT_DIR.parent / ".github/workflows/etl-recurring.yml").read_text(encoding="utf-8")
        restore = workflow.index("      - name: Restore reviewed inputs")
        gate = workflow.index("      - name: Check materialized reviewed inputs")
        execute = workflow.index("      - name: Run due ETL groups")
        self.assertLess(restore, gate)
        self.assertLess(gate, execute)
        gate_step = workflow[gate:execute]
        self.assertIn("--manifest etl/recurring_inputs_manifest.json", gate_step)
        self.assertNotIn("--all", gate_step)
        self.assertNotIn("continue-on-error", gate_step)
        self.assertNotIn("if:", gate_step)
        self.assertIn(
            "> etl/runtime/recurring_input_preflight.json", gate_step,
        )
        self.assertIn("if: always()", workflow[execute:])
        self.assertIn("elementary-v2/etl/runtime/recurring_*.json", workflow[execute:])


if __name__ == "__main__":
    unittest.main()
