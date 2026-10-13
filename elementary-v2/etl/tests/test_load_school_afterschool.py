import unittest

from etl.load_school_afterschool import category, clean_row, school_record, table_rows

ROW = ['방과후', '컴퓨터', '컴기초', 'A', '1-2학년', '수목', '13:00', '14:20', 'true', '1분기', 12]


class CleanRowTest(unittest.TestCase):
    def test_keeps_a_grade1_row(self):
        row = clean_row(ROW)
        self.assertEqual((row['days'], row['start'], row['end'], row['grade1']), ('수목', '13:00', '14:20', 'true'))

    def test_drops_rows_grade1_cannot_take_and_prior_years(self):
        self.assertIsNone(clean_row(ROW[:8] + ['false'] + ROW[9:]))
        self.assertIsNone(clean_row(ROW[:9] + ['2025학년도 12~2월(정산서)', 12]))

    def test_true_without_grade_text_is_unknown(self):
        self.assertEqual(clean_row(ROW[:4] + [None] + ROW[5:])['grade1'], 'unknown')

    def test_saturday_and_bad_times_are_dropped(self):
        row = clean_row(ROW[:5] + ['토수', '오후', '14:20'] + ROW[8:])
        self.assertEqual((row['days'], row['start'], row['end']), ('수', None, '14:20'))
        reversed_times = clean_row(ROW[:6] + ['14:15', '13:35'] + ROW[8:])
        self.assertEqual((reversed_times['start'], reversed_times['end']), (None, None))

    def test_v1_rows_without_term(self):
        self.assertEqual(clean_row(ROW[:9] + [12])['name'], '컴퓨터')


class SchoolRecordTest(unittest.TestCase):
    def test_tiers_and_option_counting(self):
        rows = [ROW, ROW[:3] + ['B'] + ROW[4:], ['맞춤형', '놀이체육', None, None, '1학년', '월', '13:00', '14:20', 'true', None, 3]]
        record = school_record({'school_id': 'X', 'rows': rows})
        self.assertEqual(record['tier'], 'A')
        self.assertEqual(record['grade1_options'], 2)   # A/B 분반은 하나, 맞춤형은 따로
        self.assertEqual(record['latest']['목'], '14:20')
        self.assertEqual(len(table_rows([record], '2026-10-13')['school_afterschool_programs']), 3)

    def test_mostly_unreadable_school_is_not_published(self):
        rows = [ROW[:5] + [None, None, None] + ROW[8:]] * 3 + [ROW]
        self.assertIsNone(school_record({'school_id': 'X', 'rows': rows}))

    def test_category(self):
        self.assertEqual(category('원어민영어 Starter'), '영어')
        self.assertEqual(category('펀펀 세계탐험'), '기타')


if __name__ == '__main__':
    unittest.main()
