"""The 90% score must never bypass missing custom times or an incomplete review."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from etl.pivot_p1_review_gate import TEST_IDS, evaluate
from etl.load_school_afterschool import build, load_period_estimates, table_rows


class PivotP1ReviewGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.outputs = Path(self.tmp.name)
        self.schools = []
        self.review = {'schools': []}
        for sid in sorted(TEST_IDS):
            row = ['맞춤형', '책놀이', None, 'A', '1학년', 'table', '월',
                   '13:00', '14:20', 'true', '학기', '2026', 10]
            self.schools.append({'school_id': sid, 'rows': [row]})
            self.review['schools'].append({
                'school_id': sid, 'output_sha256': '', 'blocking_issues': [],
                'expected_grade1_custom_rows': 1, 'grade1_custom_inventory_complete': True,
                'row_decisions': [{'row': 1, 'verdict': 'correct'}]})
        self.save()

    def save(self):
        path = self.outputs / 'batch_test.json'
        path.write_text(json.dumps(self.schools), encoding='utf8')
        for assessment in self.review['schools']:
            assessment['output_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()

    def test_complete_review_passes(self):
        self.assertTrue(evaluate(self.outputs, self.review)['stage1_passed'])

    def test_perfect_score_cannot_bypass_missing_custom_time(self):
        self.schools[0]['rows'][0][7] = None
        self.save()
        result = evaluate(self.outputs, self.review)
        self.assertEqual(result['accuracy_lower_bound'], 1)
        self.assertFalse(result['stage2_authorized_by_gate'])

    def test_omitted_custom_course_blocks_even_with_perfect_remaining_rows(self):
        self.review['schools'][0]['expected_grade1_custom_rows'] = 2
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])

    def test_changed_output_invalidates_review(self):
        path = self.outputs / 'batch_test.json'
        path.write_text(path.read_text(encoding='utf8') + '\n', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'changed after review'):
            evaluate(self.outputs, self.review)

    def test_missing_or_duplicate_review_is_rejected(self):
        self.review['schools'][0]['row_decisions'] = []
        with self.assertRaisesRegex(ValueError, 'every shown row'):
            evaluate(self.outputs, self.review)
        self.review['schools'][0] = self.review['schools'][1]
        with self.assertRaisesRegex(ValueError, 'complete and unique'):
            evaluate(self.outputs, self.review)

    def v2(self):
        self.review['schema_version'] = 'pivot-p1-source-review-v2'
        self.review['period_estimates_sha256'] = 'fixture-digest'
        for school, assessment in zip(self.schools, self.review['schools']):
            school['rows'][0].insert(12, '돌봄내')
            assessment['place_review_complete'] = True
        self.save()

    def test_v14_conditional_time_requires_bound_period_evidence(self):
        self.v2()
        sid = self.schools[0]['school_id']
        self.schools[0]['rows'][0][7:9] = [None, None]
        self.schools[0]['period_slots'] = {'4': ['13:00', '14:20']}
        self.save()
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])
        periods = {sid: {'월': 4}}
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            evaluate(self.outputs, self.review, periods, 'changed')
        result = evaluate(self.outputs, self.review, periods, 'fixture-digest')
        self.assertTrue(result['stage1_passed'])
        self.assertEqual(result['schools'][0]['derived_grade1_custom_rows'], [1])

    def test_missing_care_weekday_or_place_review_blocks_perfect_score(self):
        self.v2()
        self.schools[0]['rows'][0][6] = None
        self.save()
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])
        self.schools[0]['rows'][0][6] = '월'
        self.save()
        self.review['schools'][0]['place_review_complete'] = False
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])


class PivotP1ReviewedSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2]
        self.outputs = self.root / 'docs/research/pivot/p1_test5_v14_20261021'
        self.period_file = self.root / 'docs/research/audit2/grade1_dismissal_estimates_expansion_20261008.json'

    def test_bound_real_review_keeps_unresolved_schools_closed(self):
        review = json.loads((self.root / 'docs/research/pivot/p1_review_test5_v14_20261021.json').read_text(encoding='utf8'))
        result = evaluate(self.outputs, review, load_period_estimates([self.period_file]),
                          hashlib.sha256(self.period_file.read_bytes()).hexdigest())
        states = {s['school_id']: s for s in result['schools']}
        self.assertFalse(result['stage2_authorized_by_gate'])
        self.assertEqual({sid for sid, s in states.items() if s['passed']},
                         {'B000003745', 'B000003766', 'B000024240'})
        self.assertEqual(len(states['B000003753']['incomplete_grade1_custom_rows']), 6)

    def test_loader_preserves_care_dependency_and_term_reopening(self):
        records, _ = build([self.outputs], period_estimates=load_period_estimates([self.period_file]))
        programmes = table_rows(records, '2026-10-21', include_sql32=True)['school_afterschool_programs']
        care = [r for r in programmes if r['school_id'] == 'B000024240' and r['place'] == '돌봄내']
        self.assertEqual(len(care), 5)
        self.assertEqual({r['start_time'] for r in care}, {'14:30'})
        self.assertEqual({r['term'] for r in care}, {'2026 10월'})
        conditional = [r for r in programmes if r['school_id'] == 'B000024240' and r['time_source'] == 'period_slot']
        self.assertEqual(len(conditional), 10)
        self.assertTrue(all(r['place'] is None for r in conditional))
        haegeum = [r for r in programmes if r['school_id'] == 'B000003745' and r['name'] == '해금' and r['section'] == 'A']
        self.assertEqual(len(haegeum), 1)
        self.assertEqual(haegeum[0]['term'], '2026 2분기 · 2026 3분기 · 2026 4분기')


if __name__ == '__main__':
    unittest.main()
