import unittest

from etl.merge_sports_dojo_markers import dojo_marker, merge_marker


class MergeSportsDojoMarkersTest(unittest.TestCase):
    def test_dojo_marker_uses_public_sports_classification(self) -> None:
        marker = dojo_marker({
            "region": "대전광역시",
            "district": "",
            "road_address": "대전광역시 유성구 대학로 1",
            "lot_address": "",
            "longitude": 127.1,
            "latitude": 36.3,
            "institution_name": "튼튼태권도",
            "sport_type": "태권도",
        }, "pilot.json")
        self.assertEqual(marker["district"], "유성구")
        self.assertEqual(marker["institution_type_counts"], {"체육도장업": 1})
        self.assertEqual(marker["realm_counts"], {"태권도": 1})

    def test_same_address_counts_and_institutions_are_merged(self) -> None:
        target = {
            "academy_count": 2,
            "institution_type_counts": {"학원": 2},
            "realm_counts": {"입시": 2},
            "institutions": [{"name": "가학원", "type": "학원", "realm": "입시"}],
            "top_subjects": "수학",
            "source_snapshot": "academy.json",
        }
        addition = {
            "academy_count": 1,
            "institution_type_counts": {"체육도장업": 1},
            "realm_counts": {"태권도": 1},
            "institutions": [{"name": "나태권도", "type": "체육도장업", "realm": "태권도"}],
            "top_subjects": "태권도",
            "source_snapshot": "dojo.json",
        }
        merge_marker(target, addition)
        self.assertEqual(target["academy_count"], 3)
        self.assertEqual(target["realm_counts"]["태권도"], 1)
        self.assertEqual(len(target["institutions"]), 2)


if __name__ == "__main__":
    unittest.main()
