import unittest

from unittest import mock

from etl import llm_extraction_to_review
from etl.llm_extraction_check import check_care, check_clock

SOURCE = '4교시 | 11:30 | 12:10 |\n점심시간 | 12:10 | 13:00 |\n5교시 | 13:00 | 13:40 |\n오후돌봄(방과후~17:00), 저녁돌봄(17:00~19:00)'
GOOD = {'found': True, 'p4_end': '12:10', 'lunch_start': '12:10', 'lunch_end': '13:00', 'lunch_position': 'after_p4', 'p5_end': '13:40',
        'evidence': {'p4': '4교시 | 11:30 | 12:10', 'lunch': '점심시간 | 12:10 | 13:00', 'p5': '5교시 | 13:00 | 13:40'}}


class ExtractionCheckTest(unittest.TestCase):
    def test_consistent_clock_passes(self):
        self.assertEqual(check_clock(GOOD, SOURCE), [])

    def test_evidence_must_exist_and_hold_the_time(self):
        bad = {**GOOD, 'evidence': {**GOOD['evidence'], 'p5': '5교시 | 13:00 | 13:50'}}
        self.assertIn('clock.evidence.p5 not in source', check_clock(bad, SOURCE))
        wrong_time = {**GOOD, 'p5_end': '13:30'}
        self.assertIn('clock.evidence.p5 lacks 13:30', check_clock(wrong_time, SOURCE))

    def test_lunch_position_must_match_times(self):
        self.assertIn('before_p4 but lunch ends after 4교시', check_clock({**GOOD, 'lunch_position': 'before_p4'}, SOURCE))

    def test_care(self):
        care = {'status': 'stated', 'afternoon_end': '17:00', 'extended_end': '19:00', 'evidence': '오후돌봄(방과후~17:00)'}
        self.assertEqual(check_care(care, SOURCE), [])
        self.assertIn('care.extended_end not after afternoon_end', check_care({**care, 'extended_end': '16:00'}, SOURCE))
        self.assertEqual(check_care({'status': 'unknown'}, SOURCE), [])

    def test_prose_hours_in_twelve_hour_form(self):
        care = {'status': 'stated', 'afternoon_end': '17:00', 'evidence': '나라반은 5시까지 운영'}
        self.assertEqual(check_care(care, '나라반은 5시까지 운영'), [])


class ToReviewTest(unittest.TestCase):
    def build(self, rows, overrides=None):
        class Inputs:
            def __truediv__(self, name):
                return mock.Mock(read_text=lambda encoding: f'school_id: x\nschool_name: 테스트초\n{SOURCE}')
        with mock.patch.object(llm_extraction_to_review, 'INPUTS', Inputs()):
            return llm_extraction_to_review.build(rows, overrides or {})

    def test_accepted_values_become_review_entries_and_rejected_ones_wait(self):
        care = {'status': 'stated', 'afternoon_end': '17:00', 'extended_end': '19:00', 'evidence': '오후돌봄(방과후~17:00)'}
        result = self.build({'A': {'clock': GOOD, 'care': care}, 'B': {'clock': {**GOOD, 'p5_end': '13:30'}, 'care': care}})
        self.assertEqual([c['school_id'] for c in result['clock']], ['A'])
        self.assertEqual(result['clock'][0]['lunch'], ['12:10', '13:00'])
        self.assertEqual([p['school_id'] for p in result['pending']], ['B'])
        self.assertEqual(len(result['care']), 2)

    def test_override_fills_a_rejected_school(self):
        bad = {**GOOD, 'p5_end': '13:30'}
        result = self.build({'B': {'clock': bad, 'care': {'status': 'unknown'}}}, {'B': {'clock': GOOD}})
        self.assertEqual(result['pending'], [])
        self.assertEqual(result['clock'][0]['confidence'], 'source_checked')


if __name__ == '__main__':
    unittest.main()
