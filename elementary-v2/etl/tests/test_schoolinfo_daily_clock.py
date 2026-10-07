import unittest

from etl.audit_schoolinfo_daily_clock import clock_blocks, clock_rows, grade1_weekday_periods
from etl.school_document_text import file_format

# Rows as the extractor renders them for 초림초 (HWP) and 상탑초 (HWPX), and as pypdf flattens 산운초.
CHORIM = """1교시 | 09:00 ~ 09:40 (40′) | * 학습 |
쉬는 시간 | 09:40 ~ 09:50 (10′) | 놀이 |
2교시 | 09:50 ~ 10:30 (40′) | * 학습 |
3교시 | 10:40 ~ 11:20 (40′) | * 학습 |
4교시 | 11:30 ~ 12:10 (40′) | * 학습 |
점     심 | 12:10 ~ 13:00 (50′) | 급식 |
5교시 | 13:00 ~ 13:40 (40′) | * 학습 |"""
SANGTAP = """1 블록 (1교시- 2교시) | 09:00 | 10:25 | 85 | 수업 |
해피타임 | 10:25 | 10:45 | 30 |
2 블록 (3교시- 4교시) | 10:45 | 12:10 | 85 |
점  심 | 12:10 | 13:00 | 50 | 점심 식사 |
3 블록 (5교시- 6교시) | 13:00 | 13:40 | 40 |
요일 학년 | 월 | 화 | 수 | 목 | 금 | 계 |
1 | 5 | 5 | 4 | 5 | 4 | 23 | 1 | 22 |"""


class DailyClockTest(unittest.TestCase):
    def test_hwp_style_rows_form_one_whole_day(self):
        blocks = clock_blocks(clock_rows(CHORIM))
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][0], {'line': 1, 'label': '1교시', 'start': '09:00', 'end': '09:40'})
        self.assertIn({'line': 6, 'label': '점심', 'start': '12:10', 'end': '13:00'}, blocks[0])

    def test_separate_start_end_cells_and_block_labels(self):
        rows = clock_rows(SANGTAP)
        self.assertEqual(rows[0]['start'], '09:00')
        self.assertEqual(rows[0]['end'], '10:25')
        self.assertEqual(len(clock_blocks(rows)), 1)

    def test_grade1_weekday_periods(self):
        self.assertEqual(grade1_weekday_periods(SANGTAP), [[5, 5, 4, 5, 4]])
        self.assertEqual(grade1_weekday_periods('1학년 | 5교시 | 5교시 | 4교시 | 5교시 | 4교시 | 비고 |'), [[5, 5, 4, 5, 4]])

    def test_merged_grade_cell_row_follows_label(self):
        text = '1학년 | 4교시 | 3월 |\n5교시 | 5교시 | 4교시 | 5교시 | 4교시 | 2학기 비고 |'
        self.assertEqual(grade1_weekday_periods(text), [[5, 5, 4, 5, 4]])

    def test_pdf_line_with_several_slots(self):
        # pypdf output for 산운초 runs a whole table onto one line
        line = '블록 1(1,2교시)09:00 - 10:2080′ 수업중간놀이10:20 - 10:4020′ 바깥놀이블록 2(3,4교시)10:40 - 12:0080′ 수업점심시간12:00 - 12:5050′ 급식5교시12:50 - 13:3040′'
        rows = clock_rows(line)
        self.assertEqual([r['label'] for r in rows][1:], ['중간놀이', '4교시', '점심', '5교시'])
        self.assertEqual([(r['start'], r['end']) for r in rows], [('09:00', '10:20'), ('10:20', '10:40'), ('10:40', '12:00'), ('12:00', '12:50'), ('12:50', '13:30')])
        self.assertEqual(len(clock_blocks(rows)), 1)

    def test_pdf_times_without_separator(self):
        # 서울지향초 / 서울양전초 pypdf output
        run_together = '일과표구분시작끝소요시간등교08:4008:5010분1교시09:0009:4040분쉬는 시간09:4009:5010분2교시09:5010:3040분3교시10:4011:2040분4교시11:3012:1040분점심시간12:1013:0050분'
        rows = clock_rows(run_together)
        self.assertEqual((rows[1]['label'], rows[1]['start'], rows[1]['end']), ('1교시', '09:00', '09:40'))
        self.assertEqual(len(clock_blocks(rows)), 1)
        spaced = '1 교 시 09 : 00 09 : 40 40'
        self.assertEqual([(r['start'], r['end']) for r in clock_rows(spaced)], [('09:00', '09:40')])

    def test_hwp_lone_surrogate_is_dropped(self):
        import struct
        from etl.school_document_text import _para_text
        payload = struct.pack('<4H', ord('시'), 0xD800, ord('정'), ord('표'))
        self.assertEqual(_para_text(payload), '시정표')

    def test_label_after_time_and_unnumbered_period(self):
        after = ('09:00∼9:40 (40) | 1교시 |\n09:40∼10:20 (40) | 2교시 |\n10:20∼11:00 (40) | 중간활동 |\n'
                 '11:00∼11:40 (40) | 3교시 |\n12:20∼13:10 | 점심 |')
        self.assertEqual([r['label'] for r in clock_rows(after)], ['1교시', '2교시', '3교시', '점심'])
        unnumbered = '교시 | 09:00-09:40 (40)‘ |  |\n교시 | 09:50-10:30 (40)‘ |'
        self.assertEqual([r['start'] for r in clock_rows(unnumbered)], ['09:00', '09:50'])

    def test_lunch_synonyms(self):
        self.assertEqual(clock_rows('청소급식 | 12:20∼13:10 (50) | 청소 및 급식 시간 |')[0]['label'], '점심')
        # a milk break is not lunch (삼향초)
        self.assertEqual(clock_rows('중간놀이 (우유급식) | 10:30~10:50 | 놀이활동 |')[0]['label'], '중간놀이')

    def test_care_schedule_is_not_a_school_day(self):
        care = '아침돌봄 | 08:00~08:40 |\n오후돌봄 | 13:00~19:00 |'
        self.assertEqual(clock_blocks(clock_rows(care)), [])

    def test_lone_time_without_lunch_is_not_a_day(self):
        self.assertEqual(clock_blocks(clock_rows('1교시 09:00~09:40\n2교시 09:50~10:30\n3교시 10:40~11:20\n4교시 11:30~12:10')), [])

    def test_file_format_by_magic_bytes(self):
        self.assertEqual(file_format(b'%PDF-1.7'), 'pdf')
        self.assertEqual(file_format(b'PK\x03\x04rest'), 'hwpx')
        self.assertEqual(file_format(bytes.fromhex('d0cf11e0a1b11ae1')), 'hwp')
        self.assertEqual(file_format(b'<html>'), 'unknown')


if __name__ == '__main__':
    unittest.main()
