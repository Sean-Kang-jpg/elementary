import copy
import hashlib
import json
import unittest

from etl.load_morning_care_research import DEFAULT_SAMPLE, prepare, render_sql, sql_literal


class ResearchLoadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = DEFAULT_SAMPLE.read_bytes()
        cls.sample = json.loads(raw)
        cls.sha = hashlib.sha256(raw).hexdigest()

    def test_payload_preserves_scope_and_all_sources(self):
        payload = prepare(self.sample, 'seoul-morning-20261015', self.sha)
        self.assertEqual(len(payload['schools']), 40)
        self.assertEqual(sum(len(r['sources']) for r in payload['schools']), 72)
        self.assertEqual(sum(len(r['assertions']) for r in payload['schools']), 283)
        self.assertTrue(all(r['academic_year'] == 2026 for r in payload['schools']))

    def test_idempotency_key_changes_with_revised_snapshot(self):
        first = prepare(self.sample, 'seoul-morning-20261015', self.sha)
        self.assertEqual(first, prepare(self.sample, 'seoul-morning-20261015', self.sha))
        revised = copy.deepcopy(self.sample)
        revised['schools'][0]['note'] += ' revised'
        second = prepare(revised, 'seoul-morning-20261015', self.sha)
        self.assertNotEqual(first['payload_sha256'], second['payload_sha256'])

    def test_cross_school_or_out_of_bounds_evidence_is_rejected(self):
        for change in ('sha', 'line', 'ref'):
            sample = copy.deepcopy(self.sample)
            row = sample['schools'][0]
            if change == 'sha':
                row['evidence'][0]['sha256'] = 'f' * 64
            elif change == 'line':
                row['evidence'][0]['line_end'] = 1000000
            else:
                row['field_evidence']['start_time'] = ['not-a-source']
            with self.assertRaises(ValueError):
                prepare(sample, 'seoul-morning-20261015', self.sha)

    def test_plans_cannot_gain_confirmation_or_new_year(self):
        for field, value in (('operation_status', 'confirmed_operating'), ('academic_year', 2027),
                             ('publication_state', 'published'), ('escort_to_school', 'confirmed_available')):
            sample = copy.deepcopy(self.sample)
            sample['schools'][0][field] = value
            with self.assertRaises(ValueError):
                prepare(sample, 'seoul-morning-20261015', self.sha)

    def test_sql_quotes_data_and_uses_one_transaction(self):
        self.assertEqual(sql_literal("a'; DELETE FROM public.school_master; --"), "'a''; DELETE FROM public.school_master; --'")
        sql = render_sql(prepare(self.sample, 'seoul-morning-20261015', self.sha))
        self.assertEqual(sql.count('\nBEGIN;'), 1)
        self.assertEqual(sql.count('\nCOMMIT;'), 1)
        self.assertNotIn('DELETE FROM', sql)
        self.assertNotIn('INSERT INTO public.', sql)
        self.assertIn('rolling back', sql)

    def test_empty_snapshot_is_not_treated_as_a_replacement(self):
        sample = copy.deepcopy(self.sample)
        sample['schools'] = []
        with self.assertRaises(ValueError):
            prepare(sample, 'seoul-morning-20261015', self.sha)

    def test_missing_clock_does_not_erase_known_grades_or_capacity(self):
        sample = copy.deepcopy(self.sample)
        row = sample['schools'][0]
        row['start_time'] = row['end_time'] = row['end_time_raw'] = None
        row['time_status'] = 'not_found'
        row['field_evidence'].pop('start_time')
        row['field_evidence'].pop('end_time')
        payload = prepare(sample, 'seoul-morning-20261015', self.sha)
        self.assertEqual(payload['schools'][0]['target_grades'], [1, 2, 3, 4, 5, 6])
        self.assertEqual(payload['schools'][0]['capacity'], 25)


if __name__ == '__main__':
    unittest.main()
