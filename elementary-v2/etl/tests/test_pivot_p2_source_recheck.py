"""Unit tests for read-only P2 source candidate extraction."""
import unittest
from etl.pivot_p2_source_recheck import evidence, run


class P2SourceRecheckTests(unittest.TestCase):
    def test_evidence_never_approves(self):
        result = evidence("1학년 시정표\n1교시 09:00~09:40\n점심 12:00~12:40")
        self.assertTrue(result["heading_detected"])
        self.assertTrue(result["requires_manual_source_review"])
        self.assertTrue(result["keyword_matches"])

    def test_missing_probe_is_not_silently_filled(self):
        result = run({"schools": [{"school_id": "B000023087", "school_name": "위례초등학교",
                                    "probes": []}]}, cached_only=True)
        self.assertEqual(result["schools"][0]["source_files"], [])
        self.assertEqual(result["schools"][0]["publish_status"], "not_approved")
        self.assertTrue(result["no_operational_upload"])


if __name__ == "__main__":
    unittest.main()
