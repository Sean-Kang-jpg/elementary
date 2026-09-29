import csv
import sys
import tempfile
import unittest
from pathlib import Path

ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

import issue_apartment_public_keys as keys  # noqa: E402

TODAY = "2026-09-29"
LATER = "2026-10-15"

FIELDS = ["canonical_complex_id", "component_apt_ids", "component_count"]


def write_master(path: Path, complexes: list[tuple[str, list[str]]]) -> Path:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for cid, atoms in complexes:
            writer.writerow({
                "canonical_complex_id": cid,
                "component_apt_ids": repr(atoms),
                "component_count": str(len(atoms)),
            })
    return path


def cx(cid: str, *atoms: str) -> keys.Complex:
    return keys.Complex(cid, frozenset(atoms))


class KeyFormatTest(unittest.TestCase):
    def test_minted_keys_avoid_characters_that_are_read_wrong(self) -> None:
        registry = keys.Registry()
        minted = {registry.mint() for _ in range(300)}
        for key in minted:
            self.assertEqual(len(key), keys.KEY_LENGTH)
            self.assertFalse(set(key) & set("ILOU"), f"{key} contains an ambiguous character")
            self.assertTrue(set(key) <= set(keys.ALPHABET))

    def test_mint_never_returns_a_key_already_in_use(self) -> None:
        registry = keys.Registry()
        registry.keys = {k: {"issued_at": TODAY, "superseded_by": None}
                         for k in (registry.mint() for _ in range(50))}
        for _ in range(50):
            fresh = registry.mint()
            self.assertNotIn(fresh, registry.keys)
            registry.keys[fresh] = {"issued_at": TODAY, "superseded_by": None}


class RejoinTest(unittest.TestCase):
    def test_a_rebuild_with_the_same_atoms_reuses_every_key(self) -> None:
        registry = keys.Registry()
        first = keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], TODAY)
        again = keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], LATER)

        self.assertEqual(again["minted"], 0)
        self.assertEqual(again["reused"], 2)
        self.assertEqual(first["assignments"], again["assignments"])

    def test_the_prefix_flip_does_not_move_a_url(self) -> None:
        """APT: -> KAPT: is the 6.4% case. The atoms are unchanged, so the slug is."""
        registry = keys.Registry()
        before = keys.assign(registry, [cx("APT:APT123", "atom-1")], TODAY)
        after = keys.assign(registry, [cx("KAPT:A900", "atom-1")], LATER)

        self.assertEqual(after["minted"], 0)
        self.assertEqual(before["assignments"]["APT:APT123"],
                         after["assignments"]["KAPT:A900"])

    def test_a_merge_keeps_both_old_urls_alive_as_redirects(self) -> None:
        registry = keys.Registry()
        before = keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], TODAY)
        key_a, key_b = before["assignments"]["APT:a"], before["assignments"]["APT:b"]

        after = keys.assign(registry, [cx("KAPT:A1", "1", "2")], LATER)
        survivor = after["assignments"]["KAPT:A1"]

        self.assertEqual(after["minted"], 0, "a merge must not abandon a published URL")
        self.assertEqual(after["merged"], 1)
        self.assertIn(survivor, (key_a, key_b))
        dropped = key_b if survivor == key_a else key_a
        self.assertEqual(registry.keys[dropped]["superseded_by"], survivor)
        self.assertIsNone(registry.keys[survivor]["superseded_by"])

    def test_a_split_keeps_one_side_and_issues_for_the_other(self) -> None:
        registry = keys.Registry()
        before = keys.assign(registry, [cx("KAPT:A1", "1", "2")], TODAY)
        original = before["assignments"]["KAPT:A1"]

        after = keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], LATER)

        self.assertEqual(after["split"], 1)
        self.assertEqual(after["minted"], 1)
        assigned = set(after["assignments"].values())
        self.assertIn(original, assigned, "the original URL must survive a split")
        self.assertEqual(len(assigned), 2)


class CanonicalChoiceTest(unittest.TestCase):
    def test_the_canonical_is_stable_when_atom_counts_tie(self) -> None:
        """Every pending merge ties on atom count: all 187 complexes are single-atom.

        Without a deterministic tie-break the canonical would flip between
        rebuilds, and a canonical URL that moves is the failure this design
        exists to prevent.
        """
        outcomes = set()
        for _ in range(25):
            registry = keys.Registry()
            keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], TODAY)
            merged = keys.assign(registry, [cx("KAPT:A1", "1", "2")], LATER)
            winner = merged["assignments"]["KAPT:A1"]
            # Re-running the merge must not change who won.
            repeat = keys.assign(registry, [cx("KAPT:A1", "1", "2")], "2026-11-01")
            self.assertEqual(winner, repeat["assignments"]["KAPT:A1"])
            outcomes.add(registry.keys[winner]["issued_at"])
        self.assertEqual(outcomes, {TODAY}, "the earlier-issued key must win")

    def test_an_older_key_outranks_a_newer_one_covering_as_much(self) -> None:
        registry = keys.Registry(
            keys={"AAAAAAAA": {"issued_at": LATER, "superseded_by": None},
                  "ZZZZZZZZ": {"issued_at": TODAY, "superseded_by": None}},
            atoms={"1": "AAAAAAAA", "2": "ZZZZZZZZ"},
        )
        result = keys.assign(registry, [cx("KAPT:A1", "1", "2")], "2026-12-01")
        self.assertEqual(result["assignments"]["KAPT:A1"], "ZZZZZZZZ")


class VerificationTest(unittest.TestCase):
    def test_a_complex_is_never_assigned_a_superseded_key(self) -> None:
        registry = keys.Registry()
        keys.assign(registry, [cx("APT:a", "1"), cx("APT:b", "2")], TODAY)
        merged = keys.assign(registry, [cx("KAPT:A1", "1", "2")], LATER)
        self.assertEqual(keys.verify(registry, [cx("KAPT:A1", "1", "2")], merged), [])

    def test_verify_reports_a_key_shared_by_two_complexes(self) -> None:
        registry = keys.Registry(
            keys={"AAAAAAAA": {"issued_at": TODAY, "superseded_by": None}},
            atoms={"1": "AAAAAAAA"},
        )
        forged = {"assignments": {"APT:a": "AAAAAAAA", "APT:b": "AAAAAAAA"},
                  "conflicts": []}
        problems = keys.verify(registry, [cx("APT:a", "1"), cx("APT:b", "2")], forged)
        self.assertTrue(any("more than one complex" in p for p in problems))


class CommandTest(unittest.TestCase):
    def test_an_atom_in_two_complexes_fails_before_touching_the_registry(self) -> None:
        """The invariant the whole design rests on. Measured true today; if a
        build ever breaks it, rejoin becomes ambiguous and must stop."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            master = write_master(tmp_path / "master.csv",
                                  [("APT:a", ["shared"]), ("APT:b", ["shared"])])
            registry = tmp_path / "keys.json"
            code = keys.main(["--master", str(master), "--registry", str(registry), "--apply"])
            self.assertEqual(code, 1)
            self.assertFalse(registry.exists(), "a failed run must not write a registry")

    def test_dry_run_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            master = write_master(tmp_path / "master.csv", [("APT:a", ["1"])])
            registry = tmp_path / "keys.json"
            self.assertEqual(keys.main(["--master", str(master), "--registry", str(registry)]), 0)
            self.assertFalse(registry.exists())

    def test_apply_writes_a_registry_that_reloads_identically(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            master = write_master(tmp_path / "master.csv",
                                  [("APT:a", ["1"]), ("KAPT:A2", ["2", "3"])])
            registry_path = tmp_path / "keys.json"
            self.assertEqual(
                keys.main(["--master", str(master), "--registry", str(registry_path), "--apply"]), 0)

            reloaded = keys.Registry.load(registry_path)
            self.assertEqual(len(reloaded.keys), 2)
            self.assertEqual(len(reloaded.atom_to_key), 3)
            # Reloading and rerunning must reuse, not reissue.
            result = keys.assign(reloaded, [cx("APT:a", "1"), cx("KAPT:A2", "2", "3")], LATER)
            self.assertEqual(result["minted"], 0)


if __name__ == "__main__":
    unittest.main()
