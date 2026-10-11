import unittest
from pathlib import Path


SQL = (Path(__file__).resolve().parents[2] / "sql" / "27_create_apartment_identity_and_transactions.sql").read_text(encoding="utf-8")
SERVING_FIX_SQL = (
    Path(__file__).resolve().parents[2]
    / "sql"
    / "28_fix_transaction_serving_complex_aggregation.sql"
).read_text(encoding="utf-8")
SERVING_OPTIMIZATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "sql"
    / "29_optimize_transaction_serving_refresh.sql"
).read_text(encoding="utf-8")


class ApartmentTransactionSqlContractTest(unittest.TestCase):
    def test_raw_fingerprint_is_not_unique(self):
        self.assertIn("comparison_fingerprint TEXT NOT NULL", SQL)
        self.assertNotIn("UNIQUE (comparison_fingerprint", SQL)

    def test_private_tables_have_rls_and_no_public_grants(self):
        for table in (
            "apartment_entity", "apartment_source_identity", "apartment_transaction_raw",
            "apartment_transaction_link", "apartment_transaction_monthly_summary",
        ):
            self.assertIn(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY", SQL)
        self.assertIn("FROM PUBLIC, anon, authenticated", SQL)

    def test_schedule_starts_disabled(self):
        self.assertIn("'molit-apartment-trade'", SQL)
        self.assertIn("'[]'::JSONB, FALSE", SQL)

    def test_public_refresh_only_publishes_approved_rows(self):
        self.assertIn("WHERE summary.quality_status = 'approved'", SQL)
        self.assertIn("inserted_rows <> expected_rows", SQL)
        self.assertIn("public keys are missing", SQL)

    def test_security_definer_functions_have_fixed_search_path(self):
        self.assertNotIn("SET search_path = public\n", SQL)
        self.assertEqual(SQL.count("SECURITY DEFINER"), SQL.count("SET search_path = ''"))

    def test_decision_queue_is_idempotent(self):
        self.assertIn("apartment_identity_decision_idempotency_idx", SQL)

    def test_public_refresh_combines_component_atoms_at_public_key_grain(self):
        self.assertIn("GROUP BY\n        transactions.complex_public_key", SERVING_FIX_SQL)
        self.assertIn("percentile_cont(0.5)", SERVING_FIX_SQL)
        self.assertIn("latest_snapshots AS", SERVING_FIX_SQL)
        self.assertIn("raw.cancellation_date IS NULL", SERVING_FIX_SQL)
        self.assertIn("inserted_transactions <> expected_transactions", SERVING_FIX_SQL)

    def test_public_refresh_remains_private_and_fixed_path(self):
        self.assertIn("SECURITY DEFINER", SERVING_FIX_SQL)
        self.assertIn("SET search_path = ''", SERVING_FIX_SQL)
        self.assertIn(
            "REVOKE ALL ON FUNCTION refresh_apartment_transaction_monthly_serving() FROM PUBLIC",
            SERVING_FIX_SQL,
        )

    def test_nationwide_refresh_materializes_scope_and_adds_partial_indexes(self):
        self.assertIn("CREATE TEMP TABLE apartment_transaction_publish_scope", SERVING_OPTIMIZATION_SQL)
        self.assertIn("apartment_transaction_raw_active_contract_idx", SERVING_OPTIMIZATION_SQL)
        self.assertIn("apartment_transaction_link_confirmed_entity_idx", SERVING_OPTIMIZATION_SQL)
        self.assertIn("approved_transactions AS MATERIALIZED", SERVING_OPTIMIZATION_SQL)
        self.assertIn("SET search_path = ''", SERVING_OPTIMIZATION_SQL)


if __name__ == "__main__":
    unittest.main()
