import unittest

from etl.build_operational_masters import match_school_zone


class SchoolZoneMatchingTest(unittest.TestCase):
    def test_keeps_an_inactive_alias_when_it_is_an_active_candidate(self) -> None:
        self.assertEqual(
            match_school_zone("대원초통학구역", "경상남도", [("대원초", "dae-won")]),
            ["dae-won"],
        )

    def test_drops_an_inactive_leading_alias_when_school_is_absent(self) -> None:
        self.assertEqual(
            match_school_zone("대원초새봄초통학구역", "경기도", [("새봄초", "sae-bom")]),
            ["sae-bom"],
        )

    def test_splits_grade_annotated_zone_records(self) -> None:
        value = "고운초통학구역[1~4학년 적용] 으뜸초통학구역[5~6학년 적용]"
        self.assertEqual(
            match_school_zone(value, "세종특별자치시", [("고운초", "go-un"), ("으뜸초", "eu-tteum")]),
            ["go-un", "eu-tteum"],
        )

    def test_ignores_generic_local_elementary_descriptor(self) -> None:
        self.assertEqual(
            match_school_zone("성연초관내면지역초제한적공동(일방)통학구역", "충청남도", [("성연초", "seong-yeon")]),
            ["seong-yeon"],
        )

    def test_matches_branch_label_to_base_school_name(self) -> None:
        self.assertEqual(
            match_school_zone("후포초후포동부분교장통학구역", "경상북도", [("후포초", "hupo"), ("후포동부초", "hupo-east")]),
            ["hupo", "hupo-east"],
        )

    def test_ignores_an_unclosed_transition_plan(self) -> None:
        value = "구정초인덕초포항원동초통학구역(2026학년도: 자유학구제"
        self.assertEqual(
            match_school_zone(
                value,
                "경상북도",
                [("구정초", "gujeong"), ("인덕초", "indeok"), ("포항원동초", "wondong")],
            ),
            ["gujeong", "indeok", "wondong"],
        )

    def test_accepts_dae_joint_suffix_spelling(self) -> None:
        self.assertEqual(
            match_school_zone("성연초대공동(일방)통학구역", "충청남도", [("성연초", "seong-yeon")]),
            ["seong-yeon"],
        )


if __name__ == "__main__":
    unittest.main()


class UpstreamGapSegmentationTest(unittest.TestCase):
    """A joint zone must keep the schools that exist when one is a listed gap."""

    def test_a_joint_zone_naming_a_listed_gap_keeps_its_real_school(self) -> None:
        self.assertEqual(
            match_school_zone(
                "무안사랑초무안희망초공동통학구역",
                "전라남도",
                [("무안사랑초", "sarang")],
            ),
            ["sarang"],
        )

    def test_a_zone_naming_only_a_listed_gap_still_matches_nothing(self) -> None:
        """Dropping the name must not let the zone borrow a neighbour's school."""
        self.assertEqual(
            match_school_zone(
                "무안희망초제한적공동통학구역",
                "전라남도",
                [("무안사랑초", "sarang")],
            ),
            [],
        )

    def test_a_gap_name_that_is_a_real_candidate_is_not_dropped(self) -> None:
        """Once the source republishes the school, the label must match it."""
        self.assertEqual(
            match_school_zone(
                "무안희망초제한적공동통학구역",
                "전라남도",
                [("무안희망초", "himang")],
            ),
            ["himang"],
        )

    def test_the_retry_cannot_change_a_label_that_already_matched(self) -> None:
        """It runs only on a label that matched nothing, so it never rewrites one."""
        self.assertEqual(
            match_school_zone(
                "무안사랑초통학구역",
                "전라남도",
                [("무안사랑초", "sarang"), ("무안희망초", "himang")],
            ),
            ["sarang"],
        )
