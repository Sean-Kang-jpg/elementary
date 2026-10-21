import unittest

from etl.afterschool_rules import merge_terms, resolve_period_slots


def row(**fields):
    base = {'kind': '맞춤형', 'name': '놀이체육', 'variant': None, 'section': '1-A', 'grades_raw': '1학년',
            'grade_source': 'row', 'days': '월', 'start': None, 'end': None, 'grade1': 'true', 'period': '학기',
            'term': '2026 연간', 'place': None, 'line': 348}
    return {**base, **fields}


# 위례고운초 B000024240: grade 1 has 5 periods Mon/Tue/Thu, 4 on Wed/Fri (SQL 26, 2026-10-21)
PERIODS = {'월': 5, '화': 5, '수': 4, '목': 5, '금': 4}
SLOTS = {'4': ['13:00', '14:20'], '5': ['13:50', '15:10'], '2': ['10:40', '12:00']}


class ResolvePeriodSlotsTest(unittest.TestCase):
    def test_grade1_periods_do_not_fill_paid_or_other_grade_courses(self):
        for fields in ({'kind': '방과후'}, {'grades_raw': '2학년', 'grade1': 'false'},
                       {'grades_raw': '1~2학년'}, {'period': '방학'}):
            candidate = row(**fields)
            self.assertEqual(resolve_period_slots([candidate], SLOTS, PERIODS), [candidate])

    def test_each_weekday_gets_the_slot_for_its_period_count(self):
        mon, wed = resolve_period_slots([row(days='월'), row(days='수', name='놀이영어')], SLOTS, PERIODS)
        self.assertEqual((mon['start'], mon['end'], mon['time_source']), ('13:50', '15:10', 'period_slot'))
        self.assertEqual((wed['start'], wed['end']), ('13:00', '14:20'))

    def test_a_row_over_days_with_different_slots_is_split(self):
        rows = resolve_period_slots([row(days='월수금')], SLOTS, PERIODS)
        self.assertEqual(sorted((r['days'], r['start']) for r in rows), [('수금', '13:00'), ('월', '13:50')])

    def test_rows_with_times_or_unknown_periods_are_left_alone(self):
        timed = row(start='13:00', end='14:00')
        self.assertEqual(resolve_period_slots([timed], SLOTS, PERIODS), [timed])
        unknown = row(days='월')
        self.assertEqual(resolve_period_slots([unknown], SLOTS, {'화': 5}), [unknown])
        self.assertEqual(resolve_period_slots([unknown], {}, PERIODS), [unknown])


class MergeTermsTest(unittest.TestCase):
    def test_the_same_class_in_two_terms_is_one_row(self):
        # 구산초 B000001888: 꾸러기 A in the 1기 and 3기 tables, same days and times
        a1 = row(kind='방과후', name='꾸러기', section='A', days='월', start='12:50', end='14:30', term='2026 1기', line=217)
        a3 = {**a1, 'term': '2026 3기', 'line': 272}
        merged = merge_terms([a1, a3])
        self.assertEqual(len(merged), 1)
        self.assertEqual((merged[0]['term'], merged[0]['line']), ('2026 1기 · 2026 3기', 217))

    def test_a_class_whose_time_changes_stays_separate(self):
        a1 = row(kind='방과후', name='꾸러기', section='A', start='12:50', end='14:30', term='2026 1기')
        a3 = {**a1, 'start': '13:40', 'term': '2026 3기'}
        self.assertEqual(len(merge_terms([a1, a3])), 2)


if __name__ == '__main__':
    unittest.main()
