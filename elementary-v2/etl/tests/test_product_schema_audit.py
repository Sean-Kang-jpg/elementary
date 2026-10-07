import unittest

from etl.audit_product_schema import declarations, split_top_level


class ProductSchemaAuditTests(unittest.TestCase):
    def test_nested_and_escaped_literals(self):
        self.assertEqual(split_top_level("a numeric(6, 3), b text default 'a,b''c', check (a in (1,2))"), ["a numeric(6, 3)", "b text default 'a,b''c'", "check (a in (1,2))"])

    def test_unbalanced_fails(self):
        with self.assertRaises(ValueError):
            split_top_level('a numeric(6, 3')

    def test_unlogged_and_alter(self):
        result = declarations("CREATE UNLOGGED TABLE IF NOT EXISTS sample (id text primary key, v numeric(6,3), CHECK (v > 0)); ALTER TABLE sample ADD COLUMN IF NOT EXISTS extra text;")
        self.assertEqual(result['columns'], {'sample': ['extra', 'id', 'v']})

    def test_policy_and_function(self):
        result = declarations('CREATE POLICY "read own" ON public.sample FOR SELECT USING (true); CREATE OR REPLACE FUNCTION public.lookup() RETURNS text AS $$ SELECT \'x\'; $$ LANGUAGE sql;')
        self.assertEqual(result['policies'], [{'name': 'read own', 'table': 'sample'}])
        self.assertEqual(result['functions'], ['lookup'])

    def test_comments_are_not_declarations(self):
        result = declarations('-- CREATE TABLE fake (id text);\n/* CREATE FUNCTION fake(); */ CREATE UNIQUE INDEX IF NOT EXISTS real_idx ON sample(id);')
        self.assertEqual(result['columns'], {})
        self.assertEqual(result['indexes'], ['real_idx'])


if __name__ == '__main__':
    unittest.main()
