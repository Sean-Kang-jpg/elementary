"""Enrollment-unit checks must preserve unresolved care detail without hiding custom-course gaps."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from etl.load_school_afterschool import load_period_estimates
from etl.pivot_p1_review_gate import TEST_IDS, evaluate
from etl.pivot_p1_participation import preview


class ParticipationGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.outputs = Path(self.tmp.name)
        self.schools, self.assessments = [], []
        for sid in sorted(TEST_IDS):
            rows = [['맞춤형', '책놀이', None, 'A', '1학년', 'table', '월', '13:00', '14:20',
                     'true', '학기', '2026', None, 10],
                    ['맞춤형', '리코더', None, '돌봄', '1~2학년', 'table', None, None, None,
                     'true', '학기', '2026', '돌봄내', 20]]
            self.schools.append({'school_id': sid, 'rows': rows})
            self.assessments.append({'school_id': sid, 'expected_grade1_custom_rows': 2,
                'grade1_custom_inventory_complete': True, 'place_review_complete': True,
                'participation_review_complete': True, 'care_hours_review_complete': True,
                'care_hours': {'days': '월화수목금', 'start_basis': 'after_regular_classes',
                               'end': '19:00', 'evidence': [{'line': 25}]},
                'blocking_issues': [], 'row_decisions': [{'row': i, 'verdict': 'correct'} for i in (1, 2)],
                'participation_groups': [
                    {'group_id': 'bundle', 'mode': 'class_day_bundle', 'individually_selectable': False,
                     'rows': [1], 'evidence': [{'line': 10}]},
                    {'group_id': 'care', 'mode': 'care_activity', 'individually_selectable': False,
                     'rows': [2], 'evidence': [{'line': 20}]}]})
        self.review = {'schema_version': 'pivot-p1-source-review-v3', 'schools': self.assessments}
        self.save()

    def save(self):
        path = self.outputs / 'batch_test.json'
        path.write_text(json.dumps(self.schools), encoding='utf8')
        for a in self.assessments:
            a['output_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()

    def test_care_activity_schedule_gap_is_visible_but_not_a_course_blocker(self):
        result = evaluate(self.outputs, self.review)
        self.assertTrue(result['stage1_passed'])
        self.assertEqual(result['schools'][0]['care_activity_schedule_gaps'], [2])

    def test_missing_regular_custom_time_still_blocks(self):
        self.schools[0]['rows'][0][7] = None
        self.save()
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])

    def test_regular_custom_cannot_be_relabeled_as_care_to_bypass_missing_time(self):
        self.assessments[0]['participation_groups'][0]['mode'] = 'care_activity'
        with self.assertRaisesRegex(ValueError, 'contradicts'):
            evaluate(self.outputs, self.review)

    def test_missing_care_hours_or_participation_review_blocks(self):
        self.assessments[0]['care_hours']['end'] = None
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])
        self.assessments[0]['care_hours']['end'] = '19:00'
        self.assessments[0]['participation_review_complete'] = False
        self.assertFalse(evaluate(self.outputs, self.review)['stage1_passed'])

    def test_omitted_group_member_or_selectable_care_is_rejected(self):
        self.assessments[0]['participation_groups'][1]['rows'] = [1]
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            evaluate(self.outputs, self.review)
        self.assessments[0]['participation_groups'][1]['rows'] = [2]
        self.assessments[0]['participation_groups'][1]['individually_selectable'] = True
        with self.assertRaisesRegex(ValueError, 'not individually selectable'):
            evaluate(self.outputs, self.review)


class RealParticipationPreviewTests(unittest.TestCase):
    def test_real_class_and_care_activities_do_not_become_individual_courses(self):
        root = Path(__file__).resolve().parents[2]
        review = json.loads((root / 'docs/research/pivot/p1_review_participation_20261023.json').read_text(encoding='utf8'))
        periods = root / review['period_estimates_file']
        result = preview(root / 'docs/research/pivot/p1_test5_participation_20261023', review,
                         load_period_estimates([periods]), hashlib.sha256(periods.read_bytes()).hexdigest())
        self.assertTrue(result['gate']['stage1_passed'])
        self.assertEqual(result['publish_status'], 'not_approved')
        maesong = next(s for s in result['schools'] if s['school_id'] == 'B000003753')
        self.assertEqual(len(maesong['care_activities'][0]['activities']), 6)
        self.assertEqual(maesong['care_hours']['end'], '19:00')
        self.assertTrue(all(not g['individually_selectable'] for s in result['schools']
                            for g in s['custom_bundles'] + s['care_activities']))
        self.assertTrue(all(a['place'] is None for s in result['schools']
                            for g in s['selectable_courses'] for a in g['activities']))
        dangchon = next(s for s in result['schools'] if s['school_id'] == 'B000003739')
        second_term = [a for g in dangchon['custom_bundles'] for a in g['activities']
                       if a['term'] == '2026 2학기 8.19~12.31']
        self.assertEqual(len(second_term), 5)
        self.assertEqual({a['days']: a['start'] for a in second_term},
                         {'월': '12:50', '화': '13:40', '수': '12:50', '목': '13:40', '금': '13:40'})
        self.assertTrue(dangchon['eligibility_notes'])
