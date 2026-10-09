import unittest

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


if __name__ == '__main__':
    unittest.main()
