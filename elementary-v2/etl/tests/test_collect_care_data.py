import unittest

from etl.collect_care_data import integer


class CareDisclosureNormalizationTest(unittest.TestCase):
    def test_zero_is_preserved_as_disclosed_zero(self):
        self.assertEqual(integer(0), 0)
        self.assertEqual(integer("0"), 0)

    def test_blank_and_unparseable_are_unknown(self):
        self.assertIsNone(integer(None))
        self.assertIsNone(integer(""))
        self.assertIsNone(integer("미공시"))

    def test_negative_is_rejected_instead_of_becoming_zero(self):
        self.assertIsNone(integer(-1))


if __name__ == "__main__":
    unittest.main()
