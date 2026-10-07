import unittest

from etl.audit_product_definitions import canonical, default_value, expected, expression, index_definition, parameters, uncomment
from etl.audit_product_schema import PROJECT


class DefinitionAuditTests(unittest.TestCase):
    def test_literal_preservation(self):
        self.assertNotEqual(canonical("SELECT 'BOOL'"), canonical("SELECT 'bool'"))
        self.assertEqual(canonical("SELECT 'bool', INT4"), ['select', "'bool'", ',', 'integer'])

    def test_comment_markers_inside_literals(self):
        self.assertEqual(canonical("SELECT '--a/*b*/' -- hidden\n"), ['select', "'--a/*b*/'"])

    def test_array_default_cast(self):
        self.assertEqual(default_value("'{}'::text[]", 'TEXT[]'), default_value("'{}'", 'TEXT[]'))
        self.assertNotEqual(default_value("'1'::integer", 'TEXT'), default_value("'1'", 'TEXT'))

    def test_outer_parentheses_only(self):
        self.assertEqual(expression('((true))'), ['true'])
        self.assertEqual(expression('(a) OR (b)'), ['(', 'a', ')', 'or', '(', 'b', ')'])
        self.assertNotEqual(expression('(SELECT gate())'), expression('gate()'))

    def test_index_predicate(self):
        self.assertEqual(index_definition('t USING btree(x) WHERE (x IS NOT NULL)'), index_definition('t USING btree(x) WHERE x IS NOT NULL'))

    def test_dollar_delimiter(self):
        self.assertIn('$$', uncomment('AS $$ SELECT 1; $$ LANGUAGE sql;'))

    def test_parameter_default_and_signature(self):
        self.assertEqual(parameters('p TEXT[] DEFAULT NULL'), parameters('p text[] DEFAULT NULL::text[]'))
        self.assertNotEqual(parameters('p integer DEFAULT 5'), parameters('p integer DEFAULT 4'))

    def test_final_repository_contract(self):
        contract = expected(PROJECT / 'sql')
        self.assertEqual(len(contract['functions']), 16)
        self.assertIn('filter_school_ids', contract['functions'])
        self.assertEqual(contract['functions']['nearby_academy_addresses_for_school']['file'], '21_optimize_school_education_facility_rpc.sql')
        self.assertEqual(contract['functions']['cleanup_recurring_etl']['file'], '17_fix_staging_retention.sql')
        self.assertFalse(contract['columns'][('school_master', 'region')]['nullable'])


if __name__ == '__main__':
    unittest.main()
