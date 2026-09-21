import unittest

from etl.export_region_registry_ts import TARGET, main, render
from etl.region_registry import load_registry


class RegionRegistryExportTest(unittest.TestCase):
    def test_generated_frontend_constants_are_up_to_date(self) -> None:
        """Fails when the registry changed but the TS module was not regenerated."""
        self.assertEqual(main(["--check"]), 0)

    def test_every_region_is_exported(self) -> None:
        rendered = render()
        for region in load_registry():
            self.assertIn(f"canonicalName: '{region.canonical_name}'", rendered)

    def test_capital_centers_keep_the_coordinates_the_frontend_already_used(self) -> None:
        rendered = render()
        for expected in (
            "center: { lat: 37.5665, lng: 126.978 }",
            "center: { lat: 37.4138, lng: 127.5183 }",
            "center: { lat: 37.4563, lng: 126.7052 }",
        ):
            self.assertIn(expected, rendered)

    def test_only_capital_regions_are_marked_as_production(self) -> None:
        rendered = render()
        self.assertEqual(rendered.count("isProduction: true"), 3)

    def test_city_level_flag_matches_the_registry(self) -> None:
        registry = load_registry()
        self.assertFalse(registry.get("대전광역시").has_city_level)
        self.assertTrue(registry.get("전라남도").has_city_level)
        self.assertTrue(TARGET.exists())


if __name__ == "__main__":
    unittest.main()
