import unittest

from etl.load_school_afterschool import build, category, clean_row, grade_upper, school_record, table_rows

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

    def test_a_weekday_range_without_time_is_no_day(self):
        self.assertIsNone(clean_row(ROW[:5] + ['월화수목금', None, None] + ROW[8:])['days'])

    def test_custom_without_grade_text_is_grade1(self):
        row = clean_row(['맞춤형', '맞춤형교실', None, None, None, '월', '12:40', '14:40', 'unknown', None, 3])
        self.assertEqual((row['grade1'], row['grade_upper']), ('true', 2))
        # a 방과후 row with no grade text stays unknown
        self.assertEqual(clean_row(ROW[:4] + [None] + ROW[5:])['grade1'], 'unknown')

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

    def test_list_only_schools_are_tier_c_and_empty_ones_are_not_published(self):
        rows = [ROW[:5] + [None, None, None] + ROW[8:]] * 3 + [ROW]
        self.assertEqual(school_record({'school_id': 'X', 'rows': rows})['tier'], 'C')
        unknown_only = [ROW[:4] + [None] + ROW[5:]]
        record = school_record({'school_id': 'X', 'rows': unknown_only})
        self.assertEqual((record['tier'], record['grade1_options'], record['unknown_grade_options']), ('C', 0, 1))
        self.assertIsNone(school_record({'school_id': 'X', 'rows': []}))

    def test_latest_end_uses_lower_grade_sections(self):
        lower = ['방과후', '음악줄넘기', None, '1부', '1-2학년', '수', '13:00', '14:20', 'true', None, 4]
        upper = ['방과후', '음악줄넘기', None, '2부', '1~6학년', '수', '15:30', '17:00', 'true', None, 5]
        older = ['방과후', '음악줄넘기', None, '3부', '4~6학년', '목', '15:30', '17:20', 'false', None, 6]
        record = school_record({'school_id': 'X', 'rows': [lower, upper, older]})
        self.assertEqual((record['timeline_basis'], record['latest']['수'], record['latest']['목']), ('lower', '14:20', None))
        # the section is kept with its own grade, not the course's
        sections = record['options'][0]['sections']
        self.assertEqual([s['grade_upper'] for s in sections], [2, 6])
        all_grade = school_record({'school_id': 'X', 'rows': [upper]})
        self.assertEqual((all_grade['timeline_basis'], all_grade['latest']['수']), ('all', '17:00'))

    def test_grade_upper(self):
        self.assertEqual([grade_upper(g) for g in ('1~6학년', '1-2', 'B 1~6G', '전학년', '저학년', '1학년', None)], [6, 2, 6, 6, 3, 1, None])

    def test_custom_outputs_replace_generic_rows(self):
        import json, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            base, custom = Path(tmp, 'base'), Path(tmp, 'custom')
            base.mkdir(); custom.mkdir()
            generic = ['맞춤형', '맞춤형교실', None, None, None, '월', '12:40', '14:40', 'unknown', None, 3]
            (base / 'batch_1.json').write_text(json.dumps([{'school_id': 'X', 'rows': [ROW, generic]}]), encoding='utf-8')
            (custom / 'batch_1.json').write_text(json.dumps([{'school_id': 'X', 'rows': [['놀이체육', '월', '12:40', '14:40', '1~2학년', 9]]},
                                                             {'school_id': 'Y', 'rows': [['음악놀이', '화', None, None, None, 4]]}]), encoding='utf-8')
            records, counts = build([base], [custom])
        names = [o['name'] for o in records[0]['options'] if o['kind'] == '맞춤형']
        self.assertEqual((names, counts['schools']), (['놀이체육'], 1))   # Y was never in the base set

    def test_category(self):
        self.assertEqual(category('원어민영어 Starter'), '영어')
        self.assertEqual(category('펀펀 세계탐험'), '기타')


if __name__ == '__main__':
    unittest.main()
