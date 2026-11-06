"""K-apt address changes that broke the 2026-11-02 capital run (run 41354707718).

From its 2026-09-25 file K-apt writes the districts created in 2026 (화성시 동탄구,
인천 검단구 ...) and cuts a multi-building complex's road addresses to one. The
2024-10 apartment base keeps the old district and every building's address.
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_apartment_master_v1 as builder  # noqa: E402
from build_kapt_address_history import history  # noqa: E402


class DistrictPredecessorTest(unittest.TestCase):
    def test_new_district_also_matches_the_old_address(self):
        new = builder.address_candidates("경기도 화성시 동탄구 동탄반석로 96")
        self.assertLessEqual(builder.address_candidates("경기도 화성시 동탄반석로 96"), new)
        self.assertLessEqual(builder.address_candidates("인천광역시 중구 운서4로 18"),
                             builder.address_candidates("인천광역시 영종구 운서4로 18"))

    def test_jemulpo_gu_took_parts_of_two_districts(self):
        new = builder.address_candidates("인천광역시 제물포구 참외전로 1")
        self.assertLessEqual(builder.address_candidates("인천광역시 중구 참외전로 1"), new)
        self.assertLessEqual(builder.address_candidates("인천광역시 동구 참외전로 1"), new)

    def test_other_addresses_are_unchanged(self):
        self.assertEqual(builder.address_candidates("서울특별시 서구청로 1"), {builder.normalize("서울특별시 서구청로 1")})


class DistantLegalOnlyMatchTest(unittest.TestCase):
    """논현신동아 + 이움빌라: one K-apt code, 1.2 km apart (found 2026-11-06)."""

    ANCHOR = {"la": "37.5100", "lo": "127.0200"}
    NEARBY = {"la": "37.5105", "lo": "127.0205"}   # about 70 m
    FAR = {"la": "37.5200", "lo": "127.0300"}      # about 1.4 km

    def rejected(self, *components):
        matches = {apt_id: {"kapt_code": "A1", "evidence": evidence} for apt_id, evidence, _ in components}
        return builder.distant_legal_only_matches(matches, {apt_id: point for apt_id, _, point in components})

    def test_a_distant_component_matched_only_on_the_jibun_is_rejected(self):
        self.assertEqual(self.rejected(
            ("road", "road_address+legal_address+households", self.ANCHOR),
            ("villa", "legal_address+building_count+approval_year", self.FAR),
        ), ["villa"])

    def test_a_nearby_block_of_the_same_complex_stays(self):
        self.assertEqual(self.rejected(
            ("road", "road_address", self.ANCHOR),
            ("block2", "legal_address+building_count", self.NEARBY),
        ), [])

    def test_a_road_match_stays_however_far_the_complex_spreads(self):
        self.assertEqual(self.rejected(
            ("road", "road_address", self.ANCHOR),
            ("road2", "road_address+legal_address", self.FAR),
        ), [])

    def test_a_same_named_component_stays(self):
        self.assertEqual(self.rejected(
            ("road", "road_address", self.ANCHOR),
            ("named", "legal_address+name_district", self.FAR),
        ), [])

    def test_nothing_to_measure_from_keeps_the_match(self):
        self.assertEqual(self.rejected(("a", "legal_address", self.ANCHOR), ("b", "legal_address", self.FAR)), [])
        self.assertEqual(self.rejected(
            ("road", "road_address", {"la": "", "lo": ""}),
            ("villa", "legal_address", self.FAR),
        ), [])


class AddressHistoryTest(unittest.TestCase):
    def test_keeps_addresses_a_multi_address_listing_dropped(self):
        rows = history([
            ("2026-09-14", {"A1": ["서울특별시 강남구 압구정로29길 69", "서울특별시 강남구 압구정로29길 23"]}),
            ("2026-10-30", {"A1": ["서울특별시 강남구 압구정로29길 23"]}),
        ])
        self.assertEqual(
            rows,
            [{"kapt_code": "A1", "road_address": "서울특별시 강남구 압구정로29길 69",
              "first_seen": "2026-09-14", "last_seen": "2026-09-14"}],
        )

    def test_a_single_changed_address_is_a_correction_not_an_alias(self):
        rows = history([
            ("2026-09-14", {"A1": ["서울특별시 송파구 성내천로6길 1-13"]}),
            ("2026-10-30", {"A1": ["서울특별시 송파구 성내천로 50"]}),
        ])
        self.assertEqual(rows, [])

    def test_build_uses_only_addresses_seen_by_its_kapt_date(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "history.csv"
            path.write_text(
                "kapt_code,road_address,first_seen,last_seen\n"
                "A1,서울특별시 강남구 압구정로29길 69,2026-09-14,2026-09-14\n",
                encoding="utf-8",
            )
            original = builder.KAPT_ADDRESS_HISTORY
            builder.KAPT_ADDRESS_HISTORY = path
            try:
                self.assertEqual(builder.kapt_address_history("2026-09-01"), [])
                self.assertEqual(builder.kapt_address_history("2026-10-30"),
                                 [("A1", "서울특별시 강남구 압구정로29길 69")])
            finally:
                builder.KAPT_ADDRESS_HISTORY = original


if __name__ == "__main__":
    unittest.main()
