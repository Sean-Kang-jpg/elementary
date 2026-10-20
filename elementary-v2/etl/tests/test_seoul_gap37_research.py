import unittest

from etl.build_seoul_gap37_research import School, apply_reviewed_grade_context, clock, days, grade1


def school(lines):
    s=School.__new__(School)
    s.entry={'school_id':'fixture'}
    s.lines=lines
    s.mapping={n:{'input_line':n,'sha256':'a'*64,'source_line':n} for n in lines}
    s.rows=[]
    s.flags=[]
    return s


class ResearchRulesTest(unittest.TestCase):
    def test_capacity_continuations_are_not_course_names(self):
        s=school({1:'1 | 과학탐구1 | 1 | 20',2:'3 | 10 | 월수(주100분)',
                  3:'8 | 주1회 4시간 | 120,000원',4:'118 | 3~4학년 (주 6시간) |'})
        s.numeric(1,4)
        self.assertEqual([r['name'] for r in s.rows],['과학탐구1'])

    def test_unresolved_weekday_never_becomes_a_schedule(self):
        s=school({1:'프로그램 | 1~2학년 | 13:00~14:00'})
        s.emit('프로그램',1,'1~2학년',time='13:00~14:00')
        self.assertIsNone(s.rows[0]['weekdays'])
        self.assertIsNone(s.rows[0]['start_time'])
        self.assertEqual(s.rows[0]['operation_status'],'unknown')

    def test_morning_sports_are_not_morning_care(self):
        s=school({1:'아침수영 | 1~6학년 | 월수 | 07:30~08:10'})
        s.emit('아침수영',1,'1~6학년','월수','07:30~08:10')
        self.assertEqual(s.rows,[])
        self.assertEqual(s.flags[0]['code'],'morning_activity_excluded')

    def test_no_fabricated_clock_or_grade(self):
        self.assertEqual(clock('7,8교시'),(None,None))
        self.assertEqual(clock('14:90~15:30'),(None,None))
        self.assertEqual(clock('3:20~4:30',True),('15:20','16:30'))
        self.assertEqual(grade1(None),'unknown')
        self.assertEqual(grade1('3~6학년'),'false')

    def test_weekday_range_does_not_accept_weekly_frequency(self):
        self.assertEqual(days('월~금'),'월화수목금')
        self.assertIsNone(days('월~금(주1회)'))
        self.assertIsNone(days('여: 수/토 남: 화/토'))

    def test_literal_name_anchor_required(self):
        s=school({1:'합창 | 1~2학년'})
        with self.assertRaises(ValueError):s.emit('미술',1)

    def test_adjacent_merged_grade_has_its_own_evidence(self):
        s=school({44:'독서 교실 | 1-2학년 | 맛있는 독서 A | 금 1:40~2:40',
                  45:'맛있는 독서 B | 화 1:40~2:40'})
        s.entry['school_id']='B000002094'
        s.emit('맛있는 독서 B',45)
        changes=apply_reviewed_grade_context(s)
        self.assertEqual(len(changes),1)
        self.assertEqual(s.rows[0]['grades_raw'],'1-2학년')
        self.assertEqual(s.rows[0]['grade1'],'true')
        self.assertEqual(s.rows[0]['grade_evidence'][0]['input_line'],44)

    def test_unrelated_english_scope_is_not_general_course_grade(self):
        s=school({60:'개 설 부 서 | 놀이체육 | 미술회화',135:'라. 1～6학년을 대상으로 수업을 운영한다.'})
        s.entry['school_id']='B000002417'
        s.emit('놀이체육',60)
        self.assertEqual(apply_reviewed_grade_context(s),[])
        self.assertEqual(s.rows[0]['grade1'],'unknown')


if __name__=='__main__':unittest.main()
