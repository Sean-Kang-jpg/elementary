import unittest

from etl.molit_lawd_codes import canonical_master_lawd_code, effective_lawd_code


class MolitLawdCodeTest(unittest.TestCase):
    def test_merged_region_uses_new_code_from_effective_month(self) -> None:
        self.assertEqual(effective_lawd_code("46110", "202606"), "46110")
        self.assertEqual(effective_lawd_code("46110", "202607"), "12110")
        self.assertEqual(effective_lawd_code("29170", "202609"), "12300")

    def test_current_code_canonicalizes_to_master_generation(self) -> None:
        self.assertEqual(canonical_master_lawd_code("12110"), "46110")
        self.assertEqual(canonical_master_lawd_code("12330"), "29200")
        self.assertEqual(canonical_master_lawd_code("11680"), "11680")

if __name__ == "__main__":
    unittest.main()

