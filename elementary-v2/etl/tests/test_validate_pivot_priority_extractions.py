import unittest

from etl.validate_pivot_priority_extractions import check_rows, has_time


class PriorityEvidenceTests(unittest.TestCase):
    def row(self, **changes):
        result = ['맞춤형','미술',None,None,'1학년','row','월','13:00','13:40',
                  'true','학기','2026 연간',None,3]
        indices = {'name':1,'grade':4,'days':6,'start':7,'line':13,'grade_source':5}
        for key,value in changes.items():
            result[indices[key]] = value
        return result

    def test_header_column_controls_weekday_assignment(self):
        lines = {1:'[file: plan.hwpx; academic_year: 2026]',
                 2:'시간 | 월 | 화 |', 3:'13:00~13:40 | 1학년 미술 | 1학년 체육 |'}
        review = {'field_evidence':{'1':{'weekday_header':[2],'weekday_column':1}}}
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        # Both weekdays and both programme names exist in the same table.
        # Looking only for their existence cannot detect a swapped column.
        wrong = {'field_evidence':{'1':{'weekday_header':[2],'weekday_column':2}}}
        self.assertTrue(check_rows([self.row()],lines,wrong)[0])

    def test_weekday_header_may_spell_out_yoil(self):
        lines = {1:'[file: plan.hwp; academic_year: 2026]',
                 2:'요일 | 월요일 | 화요일 |', 3:'13:00~13:40 | 1학년 미술 | 1학년 체육 |'}
        review = {'field_evidence':{'1':{'weekday_header':[2],'weekday_column':1}}}
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        review['field_evidence']['1']['weekday_column'] = 2
        self.assertTrue(check_rows([self.row()],lines,review)[0])
        lines[2] = '일정 | (월) | (화) |'
        review['field_evidence']['1']['weekday_column'] = 1
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        # A header may note that day's regular periods: "월 (4교시)".
        lines[2] = '운영시간 | 월 (4교시) | 화 (5교시) |'
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        review['field_evidence']['1']['weekday_column'] = 2
        self.assertTrue(check_rows([self.row()],lines,review)[0])
        lines[2] = '운영시간 | 월요일(4, 5교시) | 화 (5교시) |'
        review['field_evidence']['1']['weekday_column'] = 1
        self.assertFalse(check_rows([self.row()],lines,review)[0])

    def test_merged_clock_cell_needs_a_checked_span_over_empty_cells(self):
        lines = {1:'[file: plan.hwpx; academic_year: 2026]',
                 2:'구분 | 월 | 화 | 수 |', 3:'강좌 | 미술 | 체육 | 음악 |',
                 4:'1차시 | 13:00~13:40 | | 12:00~12:40 |', 5:'대상 1학년'}
        r = self.row(grade_source='table', days='화', line=4, name='체육')
        fields = {'grades':[5],'name_table':[3],'clock_column':2,'weekday_header':[2],'weekday_column':2,
                  'clock_colspan_from':1}
        review = {'field_evidence':{'1':fields}}
        self.assertTrue(check_rows([r],lines,review)[0])
        review['table_span_checked'] = True
        self.assertFalse(check_rows([r],lines,review)[0])
        # The span may not reach across a cell that carries its own clock.
        r = self.row(grade_source='table', days='수', line=4, name='음악')
        review['field_evidence']['1'] = dict(fields, clock_column=3, weekday_column=3)
        self.assertTrue(check_rows([r],lines,review)[0])

    def test_weekday_may_come_from_the_same_departments_row_in_another_table(self):
        lines = {1:'[file: plan.hwp; academic_year: 2026]',
                 2:'1 | 미술 | A반 (1-2) | 13:00~13:40 |', 3:'1 | 미술 | 27,840 | 11개월 | 화, 주1회80분 |',
                 4:'2 | 체육 | 27,840 | 11개월 | 월, 주1회80분 |'}
        r = self.row(line=2, days='화', grade='1-2')
        review = {'field_evidence':{'1':{'weekday_refs':[3]}}}
        self.assertFalse(check_rows([r],lines,review)[0])
        # Another department's row, or a weekday found only inside "개월", is not evidence.
        review['field_evidence']['1']['weekday_refs'] = [4]
        self.assertTrue(check_rows([r],lines,review)[0])
        lines[3] = '1 | 미술 | 27,840 | 11개월 | 주1회80분 |'
        r = self.row(line=2, days='월', grade='1-2')
        review['field_evidence']['1']['weekday_refs'] = [3]
        self.assertTrue(check_rows([r],lines,review)[0])

    def test_separate_name_and_clock_grids_must_use_same_weekday_column(self):
        lines={1:'[file: plan.hwp; academic_year: 2026]',
               2:'구분 | 월 | 화 |',3:'기본 | 13:00~13:40 | 14:00~14:40 |',
               4:'강좌 | 미술 | 체육 |',5:'대상 1학년'}
        r=self.row(grade_source='table')
        review={'field_evidence':{'1':{'weekday_header':[2], 'weekday_column':1,
                                      'clock_column':1,'name_table':[4],'grades':[5]}}}
        self.assertFalse(check_rows([r],lines,review)[0])
        r[6]='화';review['field_evidence']['1']['weekday_column']=2
        self.assertTrue(check_rows([r],lines,review)[0])
        review['field_evidence']['1']['clock_column']=2
        self.assertTrue(check_rows([r],lines,review)[0])

    def test_table_grade_requires_explicit_grade_evidence(self):
        lines = {1:'[file: plan.hwpx; academic_year: 2026]',
                 2:'대상: 1학년',3:'미술 | 월 | 13:00~13:40 |'}
        row = self.row(grade_source='table')
        self.assertTrue(check_rows([row],lines,{})[0])
        review = {'field_evidence':{'1':{'grades':[2]}}}
        self.assertFalse(check_rows([row],lines,review)[0])

    def test_weekday_dot_requires_mark_in_the_selected_column(self):
        lines={1:'[file: plan.hwp; academic_year: 2026]',
               2:'강좌 | 월 | 화 | 시간 |',3:'미술 1학년 | ● | | 13:00~13:40 |'}
        review={'field_evidence':{'1':{'weekday_header':[2],'weekday_column':1,'weekday_marker':'●'}}}
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        wrong=self.row(days='화');review['field_evidence']['1']['weekday_column']=2
        self.assertTrue(check_rows([wrong],lines,review)[0])

    def test_section_cannot_be_invented_from_a_class_count(self):
        lines={1:'[file: plan.hwp; academic_year: 2026]',
               3:'미술 | 2개반 | 1학년 | 월 | 13:00~13:40 |'}
        row=self.row();row[3]='A반'
        self.assertTrue(check_rows([row],lines,{})[0])
        lines[3]='미술 | A반 | 1학년 | 월 | 13:00~13:40 |'
        self.assertFalse(check_rows([row],lines,{})[0])
        row[3]='B'
        self.assertTrue(check_rows([row],lines,{})[0])

    def test_explicit_all_grades_include_grade_one(self):
        lines={1:'[file: plan.hwp; academic_year: 2026]',
               3:'미술 | 전학년 | 월 | 13:00~13:40 |'}
        self.assertFalse(check_rows([self.row(grade='전학년')],lines,{})[0])

    def test_korean_clock_is_normalized_without_inventing_missing_minutes(self):
        self.assertTrue(has_time('오후 1시 40분 ~ 3시 00분','13:40'))
        self.assertTrue(has_time('오후 1시 40분 ~ 3시 00분','15:00'))
        self.assertFalse(has_time('오후 1시 40분 ~ 3시 00분','14:00'))

    def test_duplicate_rows_cannot_silently_pass_as_two_classes(self):
        lines = {1:'[file: plan.hwpx; academic_year: 2026]',
                 3:'미술 | 1학년 | 월 | 13:00~13:40 |',
                 4:'미술 | 1학년 | 월 | 13:00~13:40 |'}
        rows = [self.row(),self.row(line=4)]
        self.assertTrue(check_rows(rows,lines,{})[0])
        review = {'blocking_issues':[{'code':'duplicate_source_rows','lines':[3,4]}]}
        errors,warnings = check_rows(rows,lines,review)
        self.assertFalse(errors)
        self.assertEqual(warnings[0]['code'],'documented_duplicate')

    def test_previous_year_and_unsupported_clock_are_rejected(self):
        lines = {1:'[file: old.hwpx; academic_year: 2025]',
                 3:'미술 | 1학년 | 월 | 13:00~13:40 |'}
        self.assertTrue(check_rows([self.row()],lines,{})[0])
        lines[1] = '[file: plan.hwpx; academic_year: 2026]'
        self.assertTrue(check_rows([self.row(start='12:50')],lines,{})[0])

    def test_undetected_year_needs_a_2026_title_right_under_the_header(self):
        lines = {1:'[file: plan.hwp; academic_year: None]', 2:'2026학년도 방과후학교 운영 계획 |',
                 3:'미술 | 1학년 | 월 | 13:00~13:40 |'}
        self.assertTrue(check_rows([self.row()],lines,{})[0])
        self.assertFalse(check_rows([self.row()],lines,{'attachment_year_titles':{'1':2}})[0])
        lines[2] = '2025학년도 방과후학교 운영 계획 |'
        self.assertTrue(check_rows([self.row()],lines,{'attachment_year_titles':{'1':2}})[0])
        lines[1], lines[2] = '[file: plan.hwp; academic_year: 2025]', '2026학년도 방과후학교 운영 계획 |'
        self.assertTrue(check_rows([self.row()],lines,{'attachment_year_titles':{'1':2}})[0])

    def test_pdf_capacity_clock_join_requires_visual_evidence(self):
        lines={1:'[file: plan.pdf; academic_year: 2026]',3:'미술 | 1학년 | 월 | 251:45~2:25 |'}
        row=self.row(start='13:45'); row[8]='14:25'
        review={'field_evidence':{'1':{'pdf_capacity_clock_prefix':25}}}
        self.assertTrue(check_rows([row],lines,review)[0])
        review['table_visual_checked']=True
        self.assertFalse(check_rows([row],lines,review)[0])

    def test_inherited_weekday_requires_adjacent_visual_evidence(self):
        lines={1:'[file: plan.pdf; academic_year: 2026]',
               2:'미술 월',3:'미술 | 1학년 | 13:00~13:40 |'}
        review={'field_evidence':{'1':{'weekday_inherited_from':[2]}}}
        self.assertTrue(check_rows([self.row()],lines,review)[0])
        review['table_visual_checked']=True
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        review['field_evidence']['1']['weekday_inherited_from']=[1]
        self.assertTrue(check_rows([self.row()],lines,review)[0])

    def test_character_span_prevents_borrowing_another_class_time(self):
        first='미술 | 1학년 | 월 | 13:00~13:40 |'
        lines={1:'[file: plan.hwp; academic_year: 2026]',
               3:first+' / 미술 | 2학년 | 화 | 14:00~14:40 |'}
        review={'field_evidence':{'1':{'source_span':[0,len(first)]}}}
        self.assertFalse(check_rows([self.row()],lines,review)[0])
        wrong=self.row(start='14:00')
        wrong[8]='14:40'
        self.assertTrue(check_rows([wrong],lines,review)[0])


if __name__=='__main__':
    unittest.main()
