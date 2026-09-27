import unittest

from etl.audit_operational_backend import review_trace_ids


class ReviewTraceIdsTest(unittest.TestCase):
    def test_combines_scoped_queue_rows_and_polygon_no_hits(self) -> None:
        traced = review_trace_ids(
            [{"apt_cd": "queued"}, {"apt_cd": "outside-scope"}],
            [
                {"apt_cd": "no-hit", "assignment_method": "unassigned_point_nohit"},
                {"apt_cd": "ordinary", "assignment_method": "official_polygon_point"},
            ],
            {"queued", "no-hit", "ordinary"},
        )

        self.assertEqual(traced, {"queued", "no-hit"})


if __name__ == "__main__":
    unittest.main()
