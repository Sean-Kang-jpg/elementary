import tempfile
import unittest
from pathlib import Path

from etl.build_apartment_master_v1 import kapt_source_metadata
from etl.run_portable_readonly_build import ROLE_TARGETS, build_arguments


class KaptSourceMetadataTest(unittest.TestCase):
    def test_snapshot_date_and_encoding_come_from_the_file_name(self) -> None:
        path, as_of, encoding = kapt_source_metadata(Path("etl/x/kapt_basic_20260904.csv"))
        self.assertEqual(as_of, "2026-09-04")
        self.assertEqual(encoding, "utf-8-sig")
        self.assertEqual(path.name, "kapt_basic_20260904.csv")

    def test_legacy_snapshot_keeps_its_own_date_and_encoding(self) -> None:
        _, as_of, encoding = kapt_source_metadata(Path("archive/kapt/20250801_apt_data.csv"))
        self.assertEqual(as_of, "2025-08-01")
        self.assertEqual(encoding, "cp949")

    def test_an_undatable_name_is_rejected_rather_than_guessed(self) -> None:
        with self.assertRaises(ValueError):
            kapt_source_metadata(Path("kapt_latest.csv"))


class ReadonlyBuildPinningTest(unittest.TestCase):
    def test_apartment_build_is_pinned_to_the_bundle_snapshot(self) -> None:
        """Without this the build picks the newest local snapshot and drifts off baseline."""
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            arguments = build_arguments("build_apartment_master_v1.py", project)
        self.assertEqual(arguments[0], "--kapt-source")
        expected_name = ROLE_TARGETS["kapt-basic"][1]
        self.assertTrue(arguments[1].endswith(expected_name), arguments[1])

    def test_other_build_scripts_take_no_extra_arguments(self) -> None:
        for script in ("build_school_master_v2.py", "build_operational_masters.py", "audit_operational_backend.py"):
            self.assertEqual(build_arguments(script, Path(".")), [], script)


if __name__ == "__main__":
    unittest.main()
