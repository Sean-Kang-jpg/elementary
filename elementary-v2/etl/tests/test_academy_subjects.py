"""Name-based academy subjects (etl/academy_subjects.py).

The cases are the ones found checking the 2026-09-29 snapshot: keywords that sit
inside unrelated words, shorthand for several subjects, and names that say
nothing about a subject.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from academy_subjects import classify  # noqa: E402

STUDY = "입시.검정 및 보습"


class AcademySubjectsTest(unittest.TestCase):
    def test_subject_from_name(self):
        self.assertEqual(classify("301아카데미(Academy)영어교습소", STUDY), ["english"])
        self.assertEqual(classify("하이메타수학교습소", STUDY), ["math"])
        self.assertEqual(classify("한우리독서토론논술교습소", STUDY), ["writing"])
        self.assertEqual(classify("MAX(맥스)과학전문학원", STUDY), ["science"])

    def test_latin_keywords_ignore_case(self):
        self.assertEqual(classify("ENGLISH TOWN", STUDY), ["english"])
        self.assertEqual(classify("윤선생IGSE아이엘학원", STUDY), ["english"])

    def test_shorthand_for_several_subjects(self):
        self.assertEqual(classify("천상삼성영수전문학원", STUDY), ["english", "math"])
        self.assertEqual(classify("국영수학원", STUDY), ["english", "math", "writing"])

    def test_keywords_inside_other_words_do_not_match(self):
        # 어학원 inside 국어학원, 문학 inside 전문학원, 셈 inside 어셈블리, 책 inside 산책.
        self.assertEqual(classify("바다국어학원", STUDY), ["writing"])
        self.assertEqual(classify("서일영수전문학원", STUDY), ["english", "math"])
        self.assertEqual(classify("팰릭스어셈블리보습학원", STUDY), ["study"])
        self.assertEqual(classify("언어산책학원", STUDY), ["study"])
        # 개념폴리아 is a maths brand, not 폴리어학원.
        self.assertEqual(classify("개념폴리아학원", STUDY), ["study"])
        self.assertEqual(classify("강동폴리어학원", STUDY), ["english"])

    def test_names_without_a_subject_stay_study(self):
        self.assertEqual(classify("이투스247학원", STUDY), ["study"])
        self.assertEqual(classify("명문학원", STUDY), ["study"])

    def test_international_realm(self):
        self.assertEqual(classify("글로벌아카데미", "국제화"), ["english"])
        self.assertEqual(classify("차이나중국어학원", "국제화"), ["language"])
        # 국어 inside 중국어 and 외국어 is not Korean.
        self.assertEqual(classify("○○외국어학원", STUDY), ["language"])

    def test_other_realms_keep_their_category(self):
        self.assertEqual(classify("소리피아노학원", "예능(대)"), ["arts"])
        self.assertEqual(classify("미용학원", "직업기술"), ["other"])
        self.assertEqual(classify("○○독서실", "독서실"), ["other"])

    def test_sports_dojo_by_type(self):
        self.assertEqual(classify("정의검도관", "검도", "체육도장업"), ["sports"])
        self.assertEqual(classify("강한복싱", "권투", "체육도장업"), ["sports"])

    def test_never_empty(self):
        self.assertTrue(classify("", ""))


if __name__ == "__main__":
    unittest.main()
