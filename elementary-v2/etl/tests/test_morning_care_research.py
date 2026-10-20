"""Publication safety regressions using the real reviewed Seoul sample."""
import copy
import json
import unittest

from etl.build_morning_care_research import OUT, redact, validate


class MorningCareResearchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads((OUT / 'school_sample.json').read_text(encoding='utf-8'))['schools']

    def row(self, sid):
        return copy.deepcopy(next(r for r in self.rows if r['school_id'] == sid))

    def test_sample_coverage_and_no_silent_live_confirmation(self):
        self.assertEqual(len(self.rows), 40)
        self.assertEqual(len({r['district'] for r in self.rows}), 25)
        self.assertEqual(validate(self.rows), [])
        self.assertTrue(all(r['operation_status'] == 'unknown' for r in self.rows))

    def test_missing_document_information_is_not_negative_operation(self):
        row = self.row('B000002325')  # 원신: afterschool plan only
        self.assertEqual(row['plan_status'], 'not_found')
        self.assertIsNone(row['start_time'])
        row['operation_status'] = 'confirmed_not_operating'
        self.assertTrue(validate([row]))

    def test_plan_cannot_be_promoted_to_live_delivery(self):
        row = self.row('B000002275')
        row['operation_status'] = 'confirmed_operating'
        self.assertTrue(validate([row]))

    def test_conflicting_and_open_clocks_remain_unresolved(self):
        conflict = self.row('B000002216')  # 화일: 07:00 / 07:30
        self.assertIsNone(conflict['start_time'])
        conflict['start_time'] = '07:00'
        self.assertTrue(validate([conflict]))
        self.assertIsNone(self.row('B000002017')['end_time'])  # 초당: 수업전
        self.assertIsNone(self.row('B000002123')['target_grades'])  # 방이: afternoon grades

    def test_vacation_negative_does_not_cancel_term_schedule(self):
        row = self.row('B000002161')  # 선린: 미운영 is the vacation column
        self.assertEqual(row['calendar_scope'], 'term_weekday')
        self.assertEqual(row['plan_status'], 'planned')
        self.assertEqual(row['start_time'], '07:00')

    def test_headcount_and_placeholders_are_not_capacity(self):
        for sid in ('B000002160', 'B000002018', 'B000001913', 'B000001977'):
            self.assertIsNone(self.row(sid)['capacity'])

    def test_redaction_does_not_eat_adjacent_clock_digits(self):
        self.assertEqual(redact('아침돌봄07:00~09:00'), '아침돌봄07:00~09:00')
        self.assertEqual(redact('김*선 황○○'), '[인명 제외] [인명 제외]')


if __name__ == '__main__':
    unittest.main()
