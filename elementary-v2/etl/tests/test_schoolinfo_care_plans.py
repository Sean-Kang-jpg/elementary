import unittest

from etl.audit_schoolinfo_care_plans import care_candidates

# Shapes seen in the 2026 plans (양영초 PDF, 한솔초 notice, 인천구산초 plan).
TEXT = """오후돌봄 | 수업 종료후~19:00 | 돌봄교실(1층) | 1~2학년 중 희망자 |
운영 시간 | 12:30~19:00 | 09:00~15:30 | 돌봄교실 학기중 / 방학
아침돌봄 ▪ 이른 등교가 필요한 초 1~6학년 학생 아침 돌봄 | 08:00~08:40 |
저녁돌봄 ▪ 돌봄교실 소속 학생 중 저녁 돌봄 수요 | 19:00~20:00 |
방과후 프로그램 13:50~15:10 (요리)
"""


class CarePlanTest(unittest.TestCase):
    def setUp(self):
        self.found = care_candidates(TEXT)

    def test_afternoon_end_from_ranges_and_open_start(self):
        self.assertEqual(self.found['afternoon_end_candidates'], {'19:00': 2})

    def test_morning_and_evening_are_separated(self):
        self.assertEqual(self.found['morning_candidates'], {'08:00-08:40': 1})
        self.assertEqual([e['range'] for e in self.found['evening_mentions']], ['19:00-20:00'])

    def test_grades_written_beside_care(self):
        self.assertEqual(self.found['grade_mentions'], {'1~2': 1, '1~6': 1})

    def test_lines_without_care_are_ignored(self):
        # the 방과후 course line has a range but no 돌봄/늘봄
        self.assertNotIn('15:10', self.found['afternoon_end_candidates'])

    def test_vacation_range_is_not_an_afternoon_end(self):
        self.assertNotIn('15:30', self.found['afternoon_end_candidates'])


if __name__ == '__main__':
    unittest.main()
