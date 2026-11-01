"""Course-list school levels (etl/academy_levels.py).

The cases are the ones found checking the 2026-10-07 snapshot: NEIS category
labels that carry level words, music and art grades that look like school
levels, and secondary grades written with 학년.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from academy_levels import classify_levels, level_evidence  # noqa: E402


class AcademyLevelsTest(unittest.TestCase):
    def test_elementary_courses(self):
        self.assertEqual(classify_levels("초등수학A,초등영어B"), ["elem"])
        self.assertEqual(classify_levels("수학(초등)"), ["elem"])
        self.assertEqual(classify_levels("수학(초)"), ["elem"])
        # NEIS cuts long lists off mid-item.
        self.assertEqual(classify_levels("보습,독서논술(초"), ["elem"])

    def test_lower_grades(self):
        self.assertEqual(classify_levels("초등수학(저학년)"), ["lower", "elem"])
        self.assertEqual(classify_levels("초1,초2"), ["lower", "elem"])
        self.assertEqual(classify_levels("독서캠프1(초등1학년)논술"), ["lower", "elem"])
        self.assertEqual(classify_levels("초등영어(저)"), ["lower", "elem"])
        # 예비초 is the year before school, which is who the frontyard serves.
        self.assertEqual(classify_levels("예비초 독서논술"), ["lower", "elem"])

    def test_secondary_grades_with_hakyeon_are_not_lower(self):
        self.assertEqual(classify_levels("고등1학년"), ["secondary"])
        self.assertEqual(classify_levels("중등B(2학년)"), ["secondary"])
        # '고등영어(1,2학년)' split at its comma; the fragment says nothing alone.
        self.assertEqual(classify_levels("고등영어(1,2학년)"), ["secondary"])
        self.assertEqual(classify_levels("초등수학(1~2학년)"), ["lower", "elem"])

    def test_times_a_week_are_not_grades(self):
        self.assertEqual(classify_levels("초2회,초3회"), [])
        self.assertEqual(classify_levels("중2회"), [])

    def test_neis_iphsi_category_is_dropped(self):
        self.assertEqual(classify_levels("보습,입시"), [])
        self.assertEqual(classify_levels("입시·논술"), [])
        self.assertEqual(classify_levels("피아노입시,미술(입시)"), ["secondary"])

    def test_slash_cho(self):
        self.assertEqual(classify_levels("보습영어(유아/초)"), ["elem", "preschool"])

    def test_neis_category_labels_say_nothing(self):
        self.assertEqual(classify_levels("실용외국어(유아/초·중·고)"), [])
        self.assertEqual(classify_levels("독서실(유아/초・중・고)"), [])
        self.assertEqual(classify_levels("보습,실용외국어(유아/초·중·고),"), [])
        # '(중)' and '(소)' are NEIS's middle and small classifications.
        self.assertEqual(classify_levels("예능(중),기타(중),기타(소)"), [])

    def test_music_and_art_grades_are_not_school_levels(self):
        self.assertEqual(classify_levels("피아노(초급),피아노초급1,초견"), [])
        self.assertEqual(classify_levels("피아노기초1,피아노기초2"), [])
        self.assertEqual(classify_levels("피아노(초),미술(초"), [])
        self.assertEqual(classify_levels("미술중급,피아노고급"), [])

    def test_mixed_and_secondary(self):
        self.assertEqual(classify_levels("초등수학,중등수학"), ["elem", "secondary"])
        self.assertEqual(classify_levels("초·중등 영어"), ["elem", "secondary"])
        self.assertEqual(classify_levels("입시,수학(중)"), ["secondary"])
        self.assertEqual(classify_levels("고1,중3"), ["secondary"])

    def test_preschool_and_adult(self):
        self.assertEqual(classify_levels("유치부미술,유아영어A"), ["preschool"])
        self.assertEqual(classify_levels("베이스캠프(7세)"), ["preschool"])
        self.assertEqual(classify_levels("어학(성인),성인고시"), ["adult"])
        self.assertEqual(classify_levels("독서실(일반인)"), ["adult"])
        # 고시 inside 초중고시창 (sight singing) is not 성인고시.
        self.assertEqual(classify_levels("초중고시창"), ["elem", "secondary"])

    def test_fee_item_names_count(self):
        self.assertEqual(classify_levels("보습", "초등영어:200000, 중등영어:240000"), ["elem", "secondary"])
        self.assertEqual(classify_levels("", " "), [])

    def test_name_counts_for_chodeung_only(self):
        self.assertEqual(classify_levels("보습", name="해법초등수학교습소"), ["elem"])
        # School names and words that start with 초 are not levels.
        self.assertEqual(classify_levels("보습", name="서현초앞영어학원"), [])
        self.assertEqual(classify_levels("보습", name="초이스영어학원"), [])

    def test_evidence_lists_the_items(self):
        self.assertEqual(
            level_evidence("초등수학A,중등수학A,피아노초급"),
            {"elem": ["초등수학A"], "secondary": ["중등수학A"]},
        )


if __name__ == "__main__":
    unittest.main()
