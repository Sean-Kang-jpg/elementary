import tempfile
import unittest
from pathlib import Path

from etl.afterschool_checks_sheet import HEADER, detail_names, resolutions, school_questions, sheet_rows


class SheetTest(unittest.TestCase):
    def test_rows_carry_the_card_wording_weekday_and_school(self):
        rows = sheet_rows([{'school_id': 'G', 'seq': 2, 'reason': '맞춤형시각없음', 'weekday': 3, 'detail': None}],
                          {'G': {'school_name': '가초등학교', 'road_address': '경기 성남시'}}, {})
        self.assertEqual((rows[0]['school_name'], rows[0]['사유'], rows[0]['요일'], rows[0]['15-라 링크']),
                         ('가초등학교', '맞춤형 시간이 운영계획에 없어요', '수', ''))
        self.assertEqual(list(rows[0]), HEADER)

    def test_only_dated_rows_resolve_and_a_bad_date_stops(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, 'sheet.csv')
            path.write_text('school_id,seq,reason,확인일\nG,1,PDF원문,2026-11-03\nG,2,원문불일치,\n', encoding='utf-8-sig')
            self.assertEqual(resolutions(path), [{'school_id': 'G', 'seq': 1, 'reason': 'PDF원문', 'resolved_on': '2026-11-03'}])
            path.write_text('school_id,seq,reason,확인일\nG,1,PDF원문,11/3\n', encoding='utf-8-sig')
            with self.assertRaisesRegex(ValueError, 'YYYY-MM-DD'):
                resolutions(path)

    def test_one_question_line_per_school_without_line_numbers(self):
        base = {'school_id': 'G', 'school_name': '가초등학교', 'address': '경기', '15-라 링크': 'x', '세부': ''}
        rows = [{**base, 'reason': '맞춤형시각없음', '요일': '목'}, {**base, 'reason': '맞춤형시각없음', '요일': '화'},
                {**base, 'reason': '원문불일치', '요일': '', '세부': '시각 · 놀이체육 · L7 / L9'},
                {**base, 'reason': '방과후시각미확인', '요일': '수', '세부': '로봇 · A · L12'},
                {**base, 'reason': 'PDF원문', '요일': '', '세부': ''}]
        [line] = school_questions(rows)
        self.assertEqual(line['질문'], '1. 1학년 맞춤형 프로그램의 요일별 운영 시간(시작~끝) (화·목) / '
                                       '2. 요일·시간이 운영계획에 없는 방과후 강좌의 시간: 로봇 A / '
                                       '3. 운영계획 안에서 시간이 서로 다르게 적힌 강좌의 실제 시간: 놀이체육')
        self.assertEqual((line['항목 수'], line['내부 확인']), (5, 'PDF원문'))
        self.assertEqual(detail_names('6 · 7 · 8'), [])


if __name__ == '__main__':
    unittest.main()
