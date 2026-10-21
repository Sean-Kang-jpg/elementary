"""The 90% score must never bypass missing custom times or an incomplete review."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from etl.pivot_p1_review_gate import TEST_IDS, evaluate


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


if __name__ == '__main__':
    unittest.main()
