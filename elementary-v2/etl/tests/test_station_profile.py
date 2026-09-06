import csv
import tempfile
import unittest
from pathlib import Path

from etl.profile_station_source import normalized_station_name, profile


class StationProfileTest(unittest.TestCase):
    def test_profiles_capital_region_and_review_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "stations.csv"
            with source.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "역번호", "역사명", "노선번호", "노선명", "운영기관명",
                    "역위도", "역경도", "역도로명주소", "환승역여부", "데이터기준일자",
                ])
                writer.writeheader()
                writer.writerows([
                    {"역번호": "100", "역사명": "서울역", "노선번호": "1", "노선명": "1호선", "운영기관명": "A", "역위도": "37.55", "역경도": "126.97", "역도로명주소": "서울특별시 중구", "환승역여부": "Y", "데이터기준일자": "2026-06-30"},
                    {"역번호": "200", "역사명": "서울역(경의선)", "노선번호": "K", "노선명": "경의선", "운영기관명": "B", "역위도": "37.55", "역경도": "126.97", "역도로명주소": "서울특별시 용산구", "환승역여부": "Y", "데이터기준일자": "2026-06-30"},
                    {"역번호": "300", "역사명": "수원역", "노선번호": "1", "노선명": "1호선", "운영기관명": "A", "역위도": "", "역경도": "127.00", "역도로명주소": "경기도 수원시", "환승역여부": "N", "데이터기준일자": "2026-06-30"},
                    {"역번호": "400", "역사명": "부산역", "노선번호": "1", "노선명": "1호선", "운영기관명": "C", "역위도": "35.11", "역경도": "129.04", "역도로명주소": "부산광역시 동구", "환승역여부": "N", "데이터기준일자": "2026-06-30"},
                ])

            report = profile(source, root / "output")

            self.assertEqual(report["source_rows"], 4)
            self.assertEqual(report["capital_region_rows"], 3)
            self.assertEqual(report["coordinate_valid_rows"], 2)
            self.assertEqual(report["duplicate_normalized_name_groups"], 1)
            self.assertTrue((root / "output/station_review_candidates.csv").exists())

    def test_normalizes_parenthetical_station_alias(self) -> None:
        self.assertEqual(normalized_station_name("서울역(경의선)"), "서울")


if __name__ == "__main__":
    unittest.main()
