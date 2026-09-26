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
        self.assertIn("--kapt-source", arguments)
        expected_name = ROLE_TARGETS["kapt-basic"][1]
        source = arguments[arguments.index("--kapt-source") + 1]
        self.assertTrue(source.endswith(expected_name), source)

    def test_every_build_script_is_pinned_to_the_capital_scope(self) -> None:
        """The bundle reproduces the capital, not whatever the registry now holds."""
        for script in (
            "build_apartment_master_v1.py",
            "build_school_master_v2.py",
            "build_operational_masters.py",
            "audit_operational_backend.py",
        ):
            arguments = build_arguments(script, Path("."))
            self.assertEqual(arguments[:1], ["--regions"], script)
            self.assertEqual(
                set(arguments[1:4]), {"서울특별시", "경기도", "인천광역시"}, script
            )


if __name__ == "__main__":
    unittest.main()
