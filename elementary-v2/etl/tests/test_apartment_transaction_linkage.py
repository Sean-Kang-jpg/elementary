import unittest
from decimal import Decimal

from etl.apartment_transaction_linkage import (
    Linker, area_band, collapse_master, overlay_missing_master_atoms, trade_fingerprint,
)


class ApartmentTransactionLinkageTest(unittest.TestCase):
    def test_master_supplement_only_fills_missing_atoms(self) -> None:
        primary = [{"apt_cd": "A", "canonical_complex_id": "CURRENT"}]
        supplement = [
            {"apt_cd": "A", "canonical_complex_id": "STALE"},
            {"apt_cd": "B", "canonical_complex_id": "NEW"},
        ]
        merged = overlay_missing_master_atoms(primary, supplement)
        self.assertEqual(
            [(row["apt_cd"], row["canonical_complex_id"]) for row in merged],
            [("A", "CURRENT"), ("B", "NEW")],
        )

    def setUp(self) -> None:
        self.rows = [
            {
                "apt_cd": "APT1168010500100002000001",
                "canonical_complex_id": "KAPT:A1",
                "legal_dong_code": "1168010500",
                "legal_address": "서울특별시 강남구 청담동 2번지",
                "apt_nm": "테스트아파트",
                "name_aliases": "[]",
            },
            {
                "apt_cd": "APT1168010500100003000001",
                "canonical_complex_id": "KAPT:A1",
                "legal_dong_code": "1168010500",
                "legal_address": "서울특별시 강남구 청담동 3번지",
                "apt_nm": "테스트아파트",
                "name_aliases": "[]",
            },
        ]

    def test_atoms_are_collapsed_before_ambiguity(self) -> None:
        linker = Linker(collapse_master(self.rows))
        result = linker.decide({
            "sggCd": "11680", "umdCd": "10500", "bonbun": "0002", "bubun": "0000",
            "aptNm": "테스트아파트", "aptSeq": "11680-X",
        })
        self.assertTrue(result.deterministic)
        self.assertEqual(result.canonical_complex_id, "KAPT:A1")

    def test_name_only_is_review_not_confirmed(self) -> None:
        linker = Linker(collapse_master(self.rows))
        result = linker.decide({
            "sggCd": "11680", "umdCd": "10999", "bonbun": "9999", "bubun": "0000",
            "aptNm": "테스트아파트", "aptSeq": "11680-Y",
        })
        self.assertEqual(result.status, "review")
        self.assertEqual(result.tier, "unique_district_name")

    def test_confirmed_apt_seq_conflict_is_not_silently_reused(self) -> None:
        linker = Linker(collapse_master(self.rows), {
            "11680-X": {"canonical_complex_id": "KAPT:A1", "parcel_key": ["1168010500", "0002", "0000"]}
        })
        result = linker.decide({
            "sggCd": "11680", "umdCd": "10500", "bonbun": "9999", "bubun": "0000",
            "aptNm": "테스트아파트", "aptSeq": "11680-X",
        })
        self.assertEqual(result.tier, "apt_seq_address_conflict")
        self.assertEqual(result.status, "review")

    def test_duplicate_fingerprints_are_not_identifiers(self) -> None:
        row = {"aptSeq": "X", "dealYear": "2026", "dealMonth": "8", "dealDay": "1", "excluUseAr": "84.9", "floor": "3", "dealAmount": "100,000"}
        self.assertEqual(trade_fingerprint(row), trade_fingerprint(dict(row)))
        # The collector assigns occurrence ordinals; this helper intentionally
        # cannot be used as a UNIQUE transaction key.

    def test_area_bands_use_exact_decimal_boundaries(self) -> None:
        self.assertEqual(area_band(Decimal("59.9999")), "under_60")
        self.assertEqual(area_band(Decimal("60")), "60_to_84_9999")
        self.assertEqual(area_band(Decimal("85")), "85_to_101_9999")
        self.assertEqual(area_band(Decimal("102")), "102_plus")


if __name__ == "__main__":
    unittest.main()
