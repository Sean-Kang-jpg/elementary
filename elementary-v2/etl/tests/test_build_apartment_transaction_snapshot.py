import unittest

from etl.build_apartment_transaction_snapshot import build


MASTER = [{
    "apt_cd": "APT-1", "canonical_complex_id": "KAPT:A1", "legal_dong_code": "1168010500",
    "legal_address": "서울특별시 강남구 청담동 2번지", "apt_nm": "테스트", "name_aliases": "[]",
}]


def trade(**overrides):
    row = {
        "aptSeq": "SEQ-1", "sggCd": "11680", "umdCd": "10500", "bonbun": "2", "bubun": "0",
        "aptNm": "테스트", "dealYear": "2026", "dealMonth": "8", "dealDay": "1",
        "excluUseAr": "84.95", "floor": "3", "dealAmount": "100,000",
    }
    row.update(overrides)
    return row


class BuildApartmentTransactionSnapshotTest(unittest.TestCase):
    def test_legitimate_duplicates_keep_distinct_ordinals(self):
        result = build([trade(), trade()], MASTER)
        self.assertEqual(len(result["raw_rows"]), 2)
        self.assertEqual([row["occurrence_ordinal"] for row in result["raw_rows"]], [1, 2])
        self.assertEqual(result["summaries"][0]["transaction_count"], 2)

    def test_cancelled_trade_is_retained_but_not_aggregated(self):
        result = build([trade(cdealDay="20260810", cdealType="O")], MASTER)
        self.assertEqual(len(result["raw_rows"]), 1)
        self.assertEqual(result["summaries"], [])
        self.assertEqual(result["quality"]["cancelled_rows_excluded_from_summary"], 1)

    def test_apt_seq_crosswalk_is_only_a_review_proposal(self):
        result = build([trade(), trade()], MASTER)
        self.assertEqual(len(result["crosswalk_proposals"]), 1)
        self.assertEqual(result["crosswalk_proposals"][0]["decision_status"], "review")
        self.assertEqual(result["crosswalk_proposals"][0]["observation_count"], 2)

    def test_snapshot_ordinals_restart_per_district(self):
        other_master = {
            "apt_cd": "APT-2", "canonical_complex_id": "KAPT:A2", "legal_dong_code": "1111011800",
            "legal_address": "서울특별시 종로구 내수동 1번지", "apt_nm": "다른단지", "name_aliases": "[]",
        }
        other_trade = trade(
            aptSeq="SEQ-2", sggCd="11110", umdCd="11800", bonbun="1",
            aptNm="다른단지", dealDay="7",
        )
        result = build([trade(), other_trade], [*MASTER, other_master])
        self.assertEqual([row["source_row_ordinal"] for row in result["raw_rows"]], [1, 1])
        self.assertEqual([row["source_lawd_cd"] for row in result["raw_rows"]], ["11680", "11110"])
        self.assertIn("2026-08-07", {row["latest_contract_date"] for row in result["summaries"]})

    def test_crosswalk_conflict_blocks_publication_even_above_rate_gate(self):
        second_master = {
            "apt_cd": "APT-2", "canonical_complex_id": "KAPT:A2", "legal_dong_code": "1168010500",
            "legal_address": "서울특별시 강남구 청담동 3번지", "apt_nm": "두번째", "name_aliases": "[]",
        }
        trades = [trade() for _ in range(19)] + [
            trade(aptSeq="SEQ-1", bonbun="3", aptNm="두번째")
        ]
        result = build(trades, [*MASTER, second_master])
        self.assertGreaterEqual(result["quality"]["deterministic_link_rate"], 0.95)
        self.assertEqual(result["quality"]["apt_seq_crosswalk_conflicts"], 1)
        self.assertFalse(result["quality"]["publication_allowed"])
        self.assertIn("apt_seq_crosswalk_conflicts", result["quality"]["publication_blockers"])


if __name__ == "__main__":
    unittest.main()
