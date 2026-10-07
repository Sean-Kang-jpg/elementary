"""Validate saved READ ONLY evidence, not a fresh DB or write-RLS test."""
import json
import unittest

from etl.audit_product_schema import PROJECT


class ReadRoleEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results = json.loads((PROJECT / 'docs/research/audit2/read_role_results_20261006.json').read_text(encoding='utf-8'))

    def test_all_probes_read_only(self):
        for key in ('baseline', 'anon', 'authenticated_non_admin', 'anonymous_authenticated_non_admin'):
            self.assertEqual(self.results[key]['read_only'], 'on')

    def test_fixture_and_nonempty_baseline(self):
        self.assertFalse(self.results['fixture_preflight'][0]['fixture_is_admin'])
        for key, value in self.results['baseline'].items():
            if key.endswith(('have_rows', 'has_rows')):
                self.assertTrue(value, key)

    def test_anon_public_reads(self):
        result = self.results['anon']
        for domain in ('school', 'apartment', 'academy', 'care'):
            self.assertTrue(result[f'public_{domain}_visible'])
        self.assertFalse(result['private_master_visible'])
        self.assertFalse(result['admin_table_select_granted'])
        self.assertFalse(result['staging_table_select_granted'])

    def test_nonadmin_control_rows_hidden(self):
        for key in ('authenticated_non_admin', 'anonymous_authenticated_non_admin'):
            result = self.results[key]
            self.assertEqual(result['role'], 'authenticated')
            self.assertTrue(result['fixture_uid_matches'])
            self.assertFalse(result['is_etl_admin'])
            for field in ('private_master_visible', 'admin_role_row_visible', 'etl_runs_visible', 'etl_schedules_visible', 'etl_checks_visible', 'etl_sources_visible'):
                self.assertFalse(result[field], field)

    def test_mutating_etl_rpcs_not_executable(self):
        for key in ('anon', 'authenticated_non_admin', 'anonymous_authenticated_non_admin'):
            self.assertFalse(self.results[key]['refresh_execute_granted'])
            self.assertFalse(self.results[key]['cleanup_execute_granted'])


if __name__ == '__main__':
    unittest.main()
