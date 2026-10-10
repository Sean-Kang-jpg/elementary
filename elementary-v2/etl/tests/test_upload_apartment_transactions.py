import unittest

from etl.upload_apartment_transactions import entity_map, transaction_rows


class UploadApartmentTransactionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.entity_id = "11111111-1111-1111-1111-111111111111"
        self.backfill = {"identities": [{
            "source_system": "apt_base",
            "source_id": "APT-A",
            "entity_id": self.entity_id,
            "evidence": {"current_canonical_complex_id": "KAPT:A"},
        }]}

    def test_entity_map_resolves_current_build_id(self) -> None:
        self.assertEqual(entity_map(self.backfill), {"KAPT:A": self.entity_id})

    def test_private_rows_keep_source_identity_and_default_to_hold(self) -> None:
        result = {
            "raw_rows": [{
                "source_lawd_cd": "12110", "source_row_ordinal": 1,
                "fingerprint": "fp", "occurrence_ordinal": 1, "apt_seq": "46110-1",
                "deal_month": "2026-09-01", "deal_day": 8, "exclusive_area_m2": "84.9",
                "floor": 3, "deal_amount_10k_krw": 30000, "registration_date": None,
                "cancellation_date": None, "cancellation_type": None, "raw_payload": {"x": "y"},
            }],
            "links": [{
                "source_lawd_cd": "12110", "source_row_ordinal": 1,
                "canonical_complex_id": "KAPT:A", "candidate_ids": ["KAPT:A"],
                "link_status": "confirmed", "match_tier": "unique_official_parcel",
                "matcher_version": "molit-apartment-v4", "evidence": {},
            }],
            "crosswalk_proposals": [{
                "identity_scope": "apt_seq", "source_id": "46110-1", "apt_seq": "46110-1",
                "canonical_complex_id": "KAPT:A", "matcher_version": "molit-apartment-v4",
            }],
            "crosswalk_conflicts": [],
            "summaries": [{
                "canonical_complex_id": "KAPT:A", "deal_month": "2026-09-01",
                "area_band": "60_to_84_9999", "transaction_count": 1,
                "median_amount_10k_krw": "30000", "mean_amount_10k_krw": "30000",
                "median_amount_per_m2_10k_krw": "353.3569",
                "latest_contract_date": "2026-09-08",
            }],
        }
        rows = transaction_rows(
            result, {"12110": "22222222-2222-2222-2222-222222222222"},
            entity_map(self.backfill), "2026-10-10", False,
        )
        self.assertEqual(rows["raw"][0]["contract_date"], "2026-09-08")
        self.assertEqual(rows["links"][0]["entity_id"], self.entity_id)
        self.assertEqual(rows["decisions"][0]["candidate_entity_id"], self.entity_id)
        self.assertEqual(rows["decisions"][0]["source_system"], "molit_apt_seq")
        self.assertEqual(rows["summaries"][0]["quality_status"], "hold")

    def test_publish_marks_only_summaries_approved(self) -> None:
        result = {
            "raw_rows": [], "links": [{"matcher_version": "molit-apartment-v4"}],
            "crosswalk_proposals": [], "crosswalk_conflicts": [],
            "summaries": [{
                "canonical_complex_id": "KAPT:A", "deal_month": "2026-09-01",
                "area_band": "under_60", "transaction_count": 1,
                "median_amount_10k_krw": "1", "mean_amount_10k_krw": "1",
                "median_amount_per_m2_10k_krw": "1", "latest_contract_date": "2026-09-01",
            }],
        }
        rows = transaction_rows(result, {}, entity_map(self.backfill), "2026-10-10", True)
        self.assertEqual(rows["summaries"][0]["quality_status"], "approved")


if __name__ == "__main__":
    unittest.main()
