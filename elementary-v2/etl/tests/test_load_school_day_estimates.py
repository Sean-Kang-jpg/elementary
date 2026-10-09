import unittest

from etl.load_school_day_estimates import REVIEW_SETS, build_rows, violations


class LoadSchoolDayEstimatesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = build_rows('2026-10-08', [REVIEW_SETS[0]])  # the confirmed pilot set
        cls.all_rows = build_rows('2026-10-08')

    def test_reviewed_files_satisfy_sql26_constraints(self):
        self.assertEqual(violations(self.rows), [])

    def test_counts_follow_the_reviewed_sets(self):
        self.assertEqual(len(self.rows['school_day_estimates']), 35)
        self.assertEqual(len(self.rows['school_day_estimate_weekdays']), 35 * 5)
        self.assertEqual(len(self.rows['school_care_hours']), 60)

    def test_user_decisions_are_carried(self):
        notes = [r['note'] for r in self.rows['school_day_estimate_weekdays']]
        self.assertEqual(notes.count('inferred'), 9)
        self.assertEqual(notes.count('school_check_needed'), 8)
        unknown = [r for r in self.rows['school_care_hours'] if r['status'] == 'school_check_needed']
        self.assertEqual(len(unknown), 15)  # 16 until the 2026-10-09 correction gave 청산 its hours
        self.assertTrue(all(r['afternoon_end'] is None for r in unknown))

    def test_expansion_set_also_satisfies_constraints(self):
        self.assertEqual(violations(self.all_rows), [])
        ids = [r['school_id'] for r in self.all_rows['school_care_hours']]
        self.assertEqual(len(ids), len(set(ids)), 'a school appears in two review sets')

    def test_violations_catch_a_filled_unknown_day(self):
        broken = {**self.rows, 'school_day_estimate_weekdays': [
            {'school_id': self.rows['school_day_estimates'][0]['school_id'], 'weekday': 1, 'periods': 4, 'dismissal': '13:00', 'note': 'school_check_needed'}]}
        self.assertTrue(any('school_check_needed with a time' in p for p in violations(broken)))


if __name__ == '__main__':
    unittest.main()
