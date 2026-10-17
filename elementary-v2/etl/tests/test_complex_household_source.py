import unittest

from etl.build_operational_masters import build_complex_master, kapt_household_outlier


def component(**overrides: str) -> dict[str, str]:
    row = {
        "apt_cd": "APT1",
        "apt_nm": "산호",
        "canonical_complex_id": "KAPT:A14085002",
        "kapt_code": "A14085002",
        "kapt_name": "원효산호",
        "kapt_as_of": "2026-10-02",
        "kapt_households": "9",
        "canonical_households": "554",
        "kapt_parking_total": "514",
        "canonical_parking_total": "",
        "property_review_required": "True",
    }
    row.update(overrides)
    return row


class KaptHouseholdOutlierTest(unittest.TestCase):
    def test_a_collapsed_kapt_count_keeps_the_base_count(self) -> None:
        [complex_row] = build_complex_master([component()])
        self.assertEqual(complex_row["households"], 554)
        self.assertEqual(complex_row["households_source"], "apartment_base_kapt_outlier")
        self.assertTrue(complex_row["review_required"])
        # Parking still comes from K-apt; only the divisor was wrong.
        self.assertEqual(complex_row["parking_total"], 514)

    def test_an_ordinary_difference_still_adopts_kapt(self) -> None:
        [complex_row] = build_complex_master([component(kapt_households="540")])
        self.assertEqual(complex_row["households"], 540)
        self.assertEqual(complex_row["households_source"], "kapt_2026_10_02")

    def test_a_larger_kapt_count_is_not_overridden(self) -> None:
        """A base row can be one building of a complex K-apt counts whole."""
        [complex_row] = build_complex_master([component(kapt_households="1200")])
        self.assertEqual(complex_row["households"], 1200)

    def test_a_shared_group_keeps_the_kapt_total(self) -> None:
        rows = [component(apt_cd="APT1", canonical_households="300"), component(apt_cd="APT2", canonical_households="300")]
        [complex_row] = build_complex_master(rows)
        self.assertEqual(complex_row["households"], 9)

    def test_a_split_complex_keeps_its_kapt_count(self) -> None:
        """Base lumps several 단지 that K-apt splits: parking fits the K-apt count."""
        [complex_row] = build_complex_master([component(kapt_households="1270", canonical_households="4774", kapt_parking_total="1596")])
        self.assertEqual(complex_row["households"], 1270)

    def test_a_zero_kapt_count_keeps_the_base_count(self) -> None:
        [complex_row] = build_complex_master([component(kapt_households="0", canonical_households="137", kapt_parking_total="0")])
        self.assertEqual(complex_row["households"], 137)

    def test_the_rule_needs_parking_evidence(self) -> None:
        self.assertTrue(kapt_household_outlier(9, 554, 514))
        self.assertFalse(kapt_household_outlier(9, 114, None))
        self.assertFalse(kapt_household_outlier(9, 20, 514))
        self.assertFalse(kapt_household_outlier(None, 554, 514))


if __name__ == "__main__":
    unittest.main()
