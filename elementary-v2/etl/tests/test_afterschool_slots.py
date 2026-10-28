import unittest

from etl.afterschool_slots import school_slots, slot_kind


def row(**fields):
    base = {'kind': '방과후', 'name': '창의미술', 'variant': None, 'section': 'A', 'grades_raw': '1~2', 'grade_source': 'row',
            'days': '월', 'start': '13:00', 'end': '14:20', 'grade1': 'true', 'period': '학기', 'term': '2026 1기',
            'place': None, 'line': 81}
    return {**base, **fields}


class SlotKindTest(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(slot_kind(row()), '저학년방과후')
        self.assertEqual(slot_kind(row(kind='맞춤형', grades_raw=None, grade1='unknown')), '맞춤형')
        self.assertEqual(slot_kind(row(grades_raw='1~6')), '전학년방과후')
        self.assertEqual(slot_kind(row(grades_raw=None, grade1='unknown')), '학년미기재방과후')
        self.assertIsNone(slot_kind(row(period='방학')))
        self.assertIsNone(slot_kind(row(grade1='false', grades_raw='3~6')))


class SchoolSlotsTest(unittest.TestCase):
    def test_courses_sharing_a_window_are_one_slot(self):
        result = school_slots([row(), row(name='로봇과학', section='B'), row(days='화', start='13:50', end='15:10')])
        self.assertEqual([(s['weekday'], s['start'], s['courses']) for s in result['slots']],
                         [('월', '13:00', ['창의미술', '로봇과학']), ('화', '13:50', ['창의미술'])])
        self.assertEqual(result['status'], 'ok')

    def test_untimed_custom_days_and_conflicts_need_a_check(self):
        rows = [row(kind='맞춤형', name='놀이체육', days='월', grades_raw=None, grade1='unknown'),
                row(kind='맞춤형', name='음악놀이', days='화', start=None, end=None, grades_raw=None, grade1='unknown')]
        result = school_slots(rows, conflicts=[['요일', '우쿨렐레 A', 'L129 / L141']])
        self.assertEqual(result['status'], 'check')
        self.assertEqual([c[0] for c in result['checks']], ['맞춤형시각없음', '원문불일치'])
        self.assertEqual(result['checks'][0][1], '화')

    def test_morning_rows_and_no_offer(self):
        self.assertEqual(school_slots([row(start='08:00', end='08:50')])['slots'], [])
        self.assertEqual(school_slots([])['status'], 'none')

    def test_back_to_back_blocks_of_one_programme_are_one_window(self):
        blocks = [row(kind='맞춤형', name='칼림바', grades_raw=None, grade1='unknown', start=a, end=b)
                  for a, b in (('13:00', '13:40'), ('13:50', '14:30'))]
        other = row(kind='맞춤형', name='민속놀이', grades_raw=None, grade1='unknown', start='14:35', end='15:15')
        slots = school_slots(blocks + [other])['slots']
        self.assertEqual([(s['start'], s['end']) for s in slots], [('13:00', '14:30'), ('14:35', '15:15')])

    def test_classes_differing_in_grade_or_variant_are_not_merged(self):
        b = row(name='컴퓨터', section=None, variant='기초 한쇼', grades_raw='1~3학년', days='수', start='13:40', end='15:00')
        c = row(name='컴퓨터', section=None, variant='코딩과 메타버스', grades_raw='1~6학년', days='수', start='15:10', end='16:30')
        slots = school_slots([b, c])['slots']
        self.assertEqual([(s['start'], s['end']) for s in slots], [('13:40', '15:00'), ('15:10', '16:30')])

    def test_a_care_room_span_is_not_a_custom_window(self):
        span = row(kind='맞춤형', name='특기적성', grades_raw=None, grade1='unknown', place='돌봄내', start='12:40', end='15:20')
        result = school_slots([span])
        self.assertEqual(result['slots'], [])
        self.assertEqual(result['checks'], [['맞춤형시각없음', '월', None]])

    def test_place_and_period_slot_are_kept(self):
        rows = [row(kind='맞춤형', grades_raw=None, grade1='unknown', place='돌봄내', time_source='period_slot')]
        slot = school_slots(rows)['slots'][0]
        self.assertEqual((slot['place'], slot['time_source']), ('돌봄내', 'period_slot'))


if __name__ == '__main__':
    unittest.main()
