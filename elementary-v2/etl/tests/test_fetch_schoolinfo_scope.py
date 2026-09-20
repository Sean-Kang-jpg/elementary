import unittest

from etl.fetch_schoolinfo_2026 import build_scopes, row_in_scope, scope_slug
from etl.region_registry import load_registry


def school_row(office: str = "", address: str = "") -> dict[str, str]:
    return {"ATPT_OFCDC_ORG_NM": office, "ORG_RDNMA": address}


class FetchSchoolinfoScopeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = load_registry()

    def default_scopes(self):
        return build_scopes(self.registry, (), ())

    def test_default_scope_is_the_current_production_regions(self) -> None:
        scopes = self.default_scopes()
        self.assertEqual(
            [scope.label for scope in scopes], ["서울특별시", "경기도", "인천광역시"]
        )

    def test_default_scope_keeps_the_capital_file_name(self) -> None:
        """The portable bundle manifest and locked baseline depend on this slug."""
        self.assertEqual(scope_slug(self.default_scopes()), "capital")

    def test_other_scopes_are_named_by_office_code(self) -> None:
        self.assertEqual(scope_slug(build_scopes(self.registry, ["대전광역시"], ())), "g10")
        self.assertEqual(
            scope_slug(build_scopes(self.registry, ["대전광역시", "대구광역시"], ())), "d10-g10"
        )
        self.assertEqual(
            scope_slug(build_scopes(self.registry, ["전라남도"], ["목포시"])), "q10-partial"
        )

    def test_capital_rows_are_selected_by_office_or_address(self) -> None:
        scopes = self.default_scopes()
        self.assertTrue(row_in_scope(school_row(office="서울특별시교육청"), scopes))
        self.assertTrue(row_in_scope(school_row(address="경기도 성남시 분당구 판교로 1"), scopes))
        self.assertTrue(row_in_scope(school_row(office="인천광역시교육청"), scopes))

    def test_rows_outside_the_scope_are_rejected(self) -> None:
        scopes = self.default_scopes()
        self.assertFalse(row_in_scope(school_row(office="대전광역시교육청"), scopes))
        self.assertFalse(row_in_scope(school_row(address="대전광역시 서구 둔산로 100"), scopes))
        self.assertFalse(row_in_scope(school_row(), scopes))

    def test_daejeon_scope_selects_daejeon_rows_only(self) -> None:
        scopes = build_scopes(self.registry, ["대전광역시"], ())
        self.assertTrue(row_in_scope(school_row(office="대전광역시교육청"), scopes))
        self.assertTrue(row_in_scope(school_row(address="대전광역시 유성구 대학로 99"), scopes))
        self.assertFalse(row_in_scope(school_row(office="서울특별시교육청"), scopes))

    def test_city_scope_is_decided_on_the_address_not_the_office(self) -> None:
        """The office covers the whole province, so it cannot narrow to one city."""
        scopes = build_scopes(self.registry, ["전라남도"], ["목포시"])
        self.assertTrue(row_in_scope(school_row(address="전라남도 목포시 영산로 334"), scopes))
        self.assertFalse(row_in_scope(school_row(address="전라남도 여수시 시청로 1"), scopes))
        self.assertFalse(row_in_scope(school_row(office="전라남도교육청"), scopes))

    def test_pre_rename_office_names_still_resolve(self) -> None:
        scopes = build_scopes(self.registry, ["전북특별자치도"], ())
        self.assertTrue(row_in_scope(school_row(office="전라북도교육청"), scopes))
        self.assertTrue(row_in_scope(school_row(address="전라북도 전주시 완산구 효자로 225"), scopes))

    def test_cities_require_exactly_one_region(self) -> None:
        with self.assertRaises(ValueError):
            build_scopes(self.registry, ["전라남도", "광주광역시"], ["목포시"])


if __name__ == "__main__":
    unittest.main()
