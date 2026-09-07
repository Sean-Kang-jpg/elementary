"""Validate and package reviewed ETL inputs for a remote runner."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = Path(__file__).with_name("portable_inputs_manifest.json")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "runtime" / "portable-inputs"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_source(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (PROJECT_DIR / path).resolve()


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def storage_credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return url.rstrip("/"), key


def anonymous_credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set")
    return url.rstrip("/"), key


def storage_request(url: str, key: str, bucket: str, object_path: str, method: str, body: bytes | None = None) -> bytes:
    quoted_path = urllib.parse.quote(object_path, safe="/")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{bucket}/{quoted_path}",
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/octet-stream",
            **({"x-upsert": "true"} if method == "POST" else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Storage {method} {object_path}: HTTP {error.code}: {detail}") from error


def load_manifest(manifest_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("portable input manifest must contain files")

    seen_bundle_paths: set[str] = set()
    for item in files:
        required = {"role", "source_path", "bundle_path", "byte_size", "sha256"}
        missing = sorted(required - item.keys())
        if missing:
            raise ValueError(f"portable input entry missing fields: {missing}")
        bundle_path = str(item["bundle_path"])
        if bundle_path in seen_bundle_paths:
            raise ValueError(f"duplicate bundle_path: {bundle_path}")
        if Path(bundle_path).is_absolute() or ".." in Path(bundle_path).parts:
            raise ValueError(f"unsafe bundle_path: {bundle_path}")
        seen_bundle_paths.add(bundle_path)

    return manifest, files


def validate(manifest_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest, files = load_manifest(manifest_path)
    validated: list[dict[str, Any]] = []
    for item in files:

        source = resolve_source(str(item["source_path"]))
        if not source.is_file():
            raise FileNotFoundError(source)
        actual_size = source.stat().st_size
        actual_digest = sha256(source)
        if actual_size != int(item["byte_size"]):
            raise ValueError(f"{item['role']}: size {actual_size} != {item['byte_size']}")
        if actual_digest != str(item["sha256"]).lower():
            raise ValueError(f"{item['role']}: checksum mismatch")
        validated.append({**item, "resolved_source": source})
    return manifest, validated


def package(manifest: dict[str, Any], files: list[dict[str, Any]], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_stem = f"{manifest['bundle_name']}-{manifest['bundle_version']}"
    archive_path = output_dir / f"{bundle_stem}.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in files:
            archive.write(item["resolved_source"], item["bundle_path"])

    lock = {
        "bundle_name": manifest["bundle_name"],
        "bundle_version": manifest["bundle_version"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "archive_name": archive_path.name,
        "archive_byte_size": archive_path.stat().st_size,
        "archive_sha256": sha256(archive_path),
        "input_byte_size": sum(int(item["byte_size"]) for item in files),
        "files": [
            {key: item[key] for key in ("role", "bundle_path", "byte_size", "sha256")}
            for item in files
        ],
    }
    lock_path = output_dir / f"{bundle_stem}.lock.json"
    lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2), encoding="utf-8")
    return archive_path, lock_path


def verify_archive(archive_path: Path, files: list[dict[str, Any]]) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        names = set(archive.namelist())
        expected_names = {str(item["bundle_path"]) for item in files}
        if names != expected_names:
            raise ValueError(f"bundle members differ: actual={sorted(names)} expected={sorted(expected_names)}")
        for item in files:
            content = archive.read(str(item["bundle_path"]))
            if len(content) != int(item["byte_size"]):
                raise ValueError(f"{item['role']}: restored size mismatch")
            if hashlib.sha256(content).hexdigest() != str(item["sha256"]):
                raise ValueError(f"{item['role']}: restored checksum mismatch")


def upload_and_verify(manifest: dict[str, Any], files: list[dict[str, Any]], archive_path: Path) -> None:
    storage = manifest.get("storage") or {}
    bucket = storage.get("bucket")
    object_path = storage.get("archive_path")
    if not bucket or not object_path:
        raise ValueError("manifest storage.bucket and storage.archive_path are required")
    url, key = storage_credentials()
    content = archive_path.read_bytes()
    storage_request(url, key, bucket, object_path, "POST", content)
    restored = storage_request(url, key, bucket, object_path, "GET")
    if hashlib.sha256(restored).hexdigest() != hashlib.sha256(content).hexdigest():
        raise ValueError("remote archive checksum mismatch")
    verification_path = archive_path.with_name(f"{archive_path.stem}.remote-verify.zip")
    verification_path.write_bytes(restored)
    try:
        verify_archive(verification_path, files)
    finally:
        verification_path.unlink(missing_ok=True)
    print(f"uploaded and verified storage://{bucket}/{object_path}")


def verify_anonymous_access_blocked(manifest: dict[str, Any]) -> None:
    storage = manifest.get("storage") or {}
    url, key = anonymous_credentials()
    try:
        storage_request(url, key, storage["bucket"], storage["archive_path"], "GET")
    except RuntimeError as error:
        if "HTTP 400" not in str(error) and "HTTP 401" not in str(error) and "HTTP 403" not in str(error):
            raise
        print(f"anonymous access blocked for storage://{storage['bucket']}/{storage['archive_path']}")
        return
    raise RuntimeError("private portable bundle is readable with anonymous credentials")


def restore(manifest: dict[str, Any], files: list[dict[str, Any]], restore_dir: Path) -> None:
    storage = manifest.get("storage") or {}
    url, key = storage_credentials()
    content = storage_request(url, key, storage["bucket"], storage["archive_path"], "GET")
    temporary_archive = restore_dir.parent / f".{restore_dir.name}.zip"
    temporary_archive.parent.mkdir(parents=True, exist_ok=True)
    temporary_archive.write_bytes(content)
    try:
        verify_archive(temporary_archive, files)
        if restore_dir.exists() and any(restore_dir.iterdir()):
            raise ValueError(f"restore directory is not empty: {restore_dir}")
        restore_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(temporary_archive) as archive:
            archive.extractall(restore_dir)
    finally:
        temporary_archive.unlink(missing_ok=True)
    print(f"restored and verified {len(files)} inputs to {restore_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--package", action="store_true", help="Create the ZIP after validation")
    parser.add_argument("--upload", action="store_true", help="Upload the package to private Supabase Storage and verify it")
    parser.add_argument("--restore-dir", type=Path, help="Restore the private bundle and verify every member")
    parser.add_argument("--verify-anon-blocked", action="store_true", help="Fail if the private bundle is anonymously readable")
    args = parser.parse_args()
    manifest_path = args.manifest if args.manifest.is_absolute() else (PROJECT_DIR / args.manifest).resolve()
    if args.package or args.upload or not args.restore_dir:
        manifest, files = validate(manifest_path)
        print(f"validated {len(files)} reviewed inputs: {sum(int(item['byte_size']) for item in files):,} bytes")
    else:
        manifest, files = load_manifest(manifest_path)
    archive_path = None
    if args.package or args.upload:
        archive_path, lock_path = package(manifest, files, args.output_dir)
        print(f"created {archive_path} ({archive_path.stat().st_size:,} bytes)")
        print(f"wrote {lock_path}")
    if args.upload and archive_path:
        upload_and_verify(manifest, files, archive_path)
    if args.restore_dir:
        restore(manifest, files, args.restore_dir)
    if args.verify_anon_blocked:
        verify_anonymous_access_blocked(manifest)


if __name__ == "__main__":
    main()
