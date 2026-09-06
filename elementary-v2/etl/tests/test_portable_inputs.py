import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from etl import prepare_portable_inputs


class PortableInputsTest(unittest.TestCase):
    def test_validates_and_packages_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "reviewed.csv"
            source.write_text("id,value\n1,approved\n", encoding="utf-8")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps({
                "bundle_name": "test-inputs",
                "bundle_version": "v1",
                "files": [{
                    "role": "reviewed",
                    "source_path": "reviewed.csv",
                    "bundle_path": "inputs/reviewed.csv",
                    "byte_size": source.stat().st_size,
                    "sha256": digest,
                }],
            }), encoding="utf-8")

            with patch.object(prepare_portable_inputs, "PROJECT_DIR", root):
                manifest, files = prepare_portable_inputs.validate(manifest_path)
                archive, lock = prepare_portable_inputs.package(manifest, files, root / "output")

            self.assertTrue(lock.is_file())
            with zipfile.ZipFile(archive) as bundle:
                self.assertEqual(bundle.namelist(), ["inputs/reviewed.csv"])
            prepare_portable_inputs.verify_archive(archive, files)

    def test_rejects_checksum_change(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "reviewed.csv"
            source.write_text("changed", encoding="utf-8")
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps({
                "bundle_name": "test-inputs",
                "bundle_version": "v1",
                "files": [{
                    "role": "reviewed",
                    "source_path": "reviewed.csv",
                    "bundle_path": "inputs/reviewed.csv",
                    "byte_size": source.stat().st_size,
                    "sha256": "0" * 64,
                }],
            }), encoding="utf-8")

            with patch.object(prepare_portable_inputs, "PROJECT_DIR", root):
                with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                    prepare_portable_inputs.validate(manifest_path)

    def test_restores_without_local_source_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "reviewed.csv"
            source.write_text("id,value\n1,approved\n", encoding="utf-8")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            manifest = {
                "bundle_name": "test-inputs",
                "bundle_version": "v1",
                "storage": {"bucket": "private", "archive_path": "inputs/bundle.zip"},
                "files": [{
                    "role": "reviewed",
                    "source_path": "missing-on-runner.csv",
                    "bundle_path": "inputs/reviewed.csv",
                    "byte_size": source.stat().st_size,
                    "sha256": digest,
                }],
            }
            archive_path = root / "bundle.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.write(source, "inputs/reviewed.csv")

            with patch.object(prepare_portable_inputs, "storage_credentials", return_value=("https://example.test", "secret")), patch.object(
                prepare_portable_inputs,
                "storage_request",
                return_value=archive_path.read_bytes(),
            ):
                restore_dir = root / "restored"
                prepare_portable_inputs.restore(manifest, manifest["files"], restore_dir)

            self.assertEqual((restore_dir / "inputs/reviewed.csv").read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
