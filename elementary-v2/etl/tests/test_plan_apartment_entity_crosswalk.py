import unittest

from etl.plan_apartment_entity_crosswalk import plan


class ApartmentEntityCrosswalkTest(unittest.TestCase):
    def test_dry_run_is_reproducible(self):
        master = [{"apt_cd": "A1", "canonical_complex_id": "KAPT:K1", "kapt_code": "K1"}]
        first = plan(master, [], "2026-10-07")
        second = plan(master, [], "2026-10-07")
        self.assertEqual(first, second)

    def test_existing_identity_survives_canonical_id_change(self):
        master = [{"apt_cd": "A1", "canonical_complex_id": "KAPT:NEW", "kapt_code": "NEW"}]
        existing = [{"source_system": "apt_base", "source_id": "A1", "entity_id": "11111111-1111-1111-1111-111111111111", "decision_status": "confirmed"}]
        result = plan(master, existing, "2026-10-07")
        self.assertEqual(result["identities"][0]["entity_id"], existing[0]["entity_id"])

    def test_merge_conflict_is_queued_not_forced(self):
        master = [
            {"apt_cd": "A1", "canonical_complex_id": "KAPT:K1", "kapt_code": "K1"},
            {"apt_cd": "A2", "canonical_complex_id": "KAPT:K1", "kapt_code": "K1"},
        ]
        existing = [
            {"source_system": "apt_base", "source_id": "A1", "entity_id": "11111111-1111-1111-1111-111111111111", "decision_status": "confirmed"},
            {"source_system": "apt_base", "source_id": "A2", "entity_id": "22222222-2222-2222-2222-222222222222", "decision_status": "confirmed"},
        ]
        result = plan(master, existing, "2026-10-07")
        self.assertEqual(len(result["decisions"]), 1)
        self.assertEqual(result["decisions"][0]["decision_status"], "conflict")
        self.assertEqual(result["identities"], [])


if __name__ == "__main__":
    unittest.main()
