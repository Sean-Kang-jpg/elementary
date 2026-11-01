import tempfile
import unittest
from pathlib import Path

from etl.afterschool_checks_sheet import HEADER, resolutions, sheet_rows


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


if __name__ == '__main__':
    unittest.main()
