import unittest

from etl.export_region_registry_sql import TARGET, main, render
from etl.region_registry import load_registry


class RegionRegistrySqlTest(unittest.TestCase):
    def setUp(self) -> None:
        self.sql = render()

    def test_generated_migration_is_up_to_date(self) -> None:
        self.assertEqual(main(["--check"]), 0)

    def test_every_region_is_seeded(self) -> None:
        for region in load_registry():
            self.assertIn(f"('{region.canonical_name}'", self.sql)

    def test_only_capital_regions_start_in_production(self) -> None:
        self.assertEqual(self.sql.count(", TRUE, 'capital')"), 3)
        self.assertNotIn(", TRUE, 'N1')", self.sql)
        self.assertNotIn(", TRUE, 'N2')", self.sql)

    def test_literal_region_checks_are_replaced_by_foreign_keys(self) -> None:
        self.assertIn("DROP CONSTRAINT IF EXISTS apartment_complex_region_check", self.sql)
        self.assertIn("DROP CONSTRAINT IF EXISTS apartment_assignment_region_check", self.sql)
        for table in ("apartment_complex_master", "apartment_assignment_units", "school_master"):
            self.assertIn(f"ALTER TABLE {table}\n    ADD CONSTRAINT", self.sql, table)
        self.assertEqual(self.sql.count("REFERENCES region_registry(canonical_name)"), 3)

    def test_the_new_table_stays_private(self) -> None:
        """The public contract is school_master and school_apartment_serving only."""
        self.assertIn("ALTER TABLE region_registry ENABLE ROW LEVEL SECURITY", self.sql)
        self.assertIn("REVOKE ALL ON TABLE region_registry FROM PUBLIC, anon, authenticated", self.sql)
        self.assertIn("GRANT ALL ON TABLE region_registry TO service_role", self.sql)
        self.assertNotIn("GRANT SELECT ON TABLE region_registry TO anon", self.sql)

    def test_renamed_regions_keep_their_old_address_prefix(self) -> None:
        self.assertIn("ARRAY['강원특별자치도', '강원도']::TEXT[]", self.sql)
        self.assertIn("ARRAY['전북특별자치도', '전라북도']::TEXT[]", self.sql)

    def test_migration_is_transactional_and_rerunnable(self) -> None:
        self.assertTrue(self.sql.lstrip().startswith("--"))
        self.assertIn("BEGIN;", self.sql)
        self.assertIn("COMMIT;", self.sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS region_registry", self.sql)
        self.assertIn("ON CONFLICT (canonical_name) DO UPDATE", self.sql)
        self.assertIn("CREATE OR REPLACE FUNCTION region_from_address", self.sql)

    def test_schedule_update_is_guarded_for_databases_without_migration_12(self) -> None:
        self.assertIn("TO_REGCLASS('public.etl_schedules') IS NOT NULL", self.sql)

    def test_migration_number_is_unique(self) -> None:
        """14 and 15 belong to the academy domain, so this one is 16."""
        self.assertTrue(TARGET.name.startswith("16_"), TARGET.name)
        same_number = sorted(path.name for path in TARGET.parent.glob("16_*.sql"))
        self.assertEqual(same_number, [TARGET.name])


if __name__ == "__main__":
    unittest.main()
