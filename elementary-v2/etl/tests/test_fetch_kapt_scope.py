import unittest

from etl.fetch_kapt_current import row_in_scope
from etl.fetch_schoolinfo_2026 import build_scopes
from etl.region_registry import load_registry


def kapt_row(sido: str, sigungu: str = "", road: str = "", code: str = "A00000001") -> dict[str, str]:
    return {"시도": sido, "시군구": sigungu, "도로명주소": road, "단지코드": code}


class FetchKaptScopeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = load_registry()

    def scopes(self, regions=(), cities=()):
        return build_scopes(self.registry, regions, cities)

    def test_capital_scope_matches_the_previous_exact_comparison(self) -> None:
        scopes = self.scopes()
        for sido in ("서울특별시", "경기도", "인천광역시"):
            self.assertTrue(row_in_scope(kapt_row(sido, "강남구"), scopes), sido)
        self.assertFalse(row_in_scope(kapt_row("대전광역시", "서구"), scopes))

    def test_missing_or_unknown_region_is_rejected_without_raising(self) -> None:
        scopes = self.scopes()
        self.assertFalse(row_in_scope(kapt_row("", "강남구"), scopes))
        self.assertFalse(row_in_scope(kapt_row("없는도", "강남구"), scopes))

    def test_merged_source_value_is_split_by_district(self) -> None:
        """전라남도광주특별시 rows must not be dropped, and must land in the right half."""
        gwangju = self.scopes(["광주광역시"])
        jeonnam = self.scopes(["전라남도"])
        for spelling in ("전라남도광주특별시", "전남광주통합특별시"):
            self.assertTrue(row_in_scope(kapt_row(spelling, "광산구"), gwangju), spelling)
            self.assertFalse(row_in_scope(kapt_row(spelling, "광산구"), jeonnam), spelling)
            self.assertTrue(row_in_scope(kapt_row(spelling, "목포시"), jeonnam), spelling)
            self.assertFalse(row_in_scope(kapt_row(spelling, "목포시"), gwangju), spelling)

    def test_city_scope_accepts_only_its_cities(self) -> None:
        scopes = self.scopes(["전라남도"], ["목포시"])
        self.assertTrue(row_in_scope(kapt_row("전라남도", "목포시"), scopes))
        self.assertFalse(row_in_scope(kapt_row("전라남도", "여수시"), scopes))
        self.assertTrue(row_in_scope(kapt_row("전남광주통합특별시", "목포시"), scopes))
        self.assertFalse(row_in_scope(kapt_row("전남광주통합특별시", "순천시"), scopes))

    def test_short_region_spellings_resolve(self) -> None:
        scopes = self.scopes(["경기도"])
        self.assertTrue(row_in_scope(kapt_row("경기", "성남시"), scopes))


if __name__ == "__main__":
    unittest.main()
