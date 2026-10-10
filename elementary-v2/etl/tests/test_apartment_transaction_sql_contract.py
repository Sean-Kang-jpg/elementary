import unittest
from pathlib import Path


SQL = (Path(__file__).resolve().parents[2] / "sql" / "27_create_apartment_identity_and_transactions.sql").read_text(encoding="utf-8")


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


if __name__ == "__main__":
    unittest.main()
