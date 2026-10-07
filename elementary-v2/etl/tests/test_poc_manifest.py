"""Candidate manifest integrity only; not collected-source accuracy tests."""
import json
import unittest

from etl.audit_product_schema import PROJECT


class PocManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((PROJECT / 'docs/research/audit2/poc_school_manifest_20261006.json').read_text(encoding='utf-8'))
        cls.schools = cls.manifest['schools']

    def test_fixed_denominator_unique_school_ids(self):
        self.assertEqual(self.manifest['denominator'], 60)
        self.assertEqual(len(self.schools), 60)
        self.assertEqual(len({s['school_id'] for s in self.schools}), 60)

    def test_three_disjoint_cohorts(self):
        for cohort, expected in self.manifest['cohort_sizes'].items():
            self.assertEqual(sum(s['cohort'] == cohort for s in self.schools), expected)

    def test_dense_candidates_only_bundang(self):
        dense = [s for s in self.schools if s['dense_recruitment_candidate']]
        self.assertEqual(len(dense), 20)
        for school in dense:
            self.assertEqual(school['region'], '경기도')
            self.assertIn('성남시 분당구', school['road_address'])

    def test_crosswalk_not_inferred(self):
        for school in self.schools:
            self.assertRegex(school['school_id'], r'^B\d+$')
            self.assertRegex(school['neis_office_code'], r'^[A-Z]\d{2}$')
            self.assertIsNone(school['neis_school_code'])
            self.assertEqual(school['crosswalk_status'], 'unverified')

    def test_no_false_collection_or_publication_claim(self):
        for school in self.schools:
            self.assertEqual(school['publish_status'], 'not_approved')
            self.assertEqual(school['document_currentness'], 'unknown')
            for source in school['sources'].values():
                self.assertEqual(source['status'], 'not_fetched')

    def test_rank_and_population_boundaries(self):
        for stratum, stats in self.manifest['strata'].items():
            schools = [s for s in self.schools if s['stratum'] == stratum]
            self.assertEqual(sorted(s['selection_rank'] for s in schools), list(range(1, stats['selected'] + 1)))
            self.assertGreaterEqual(stats['eligible'], stats['selected'])


if __name__ == '__main__':
    unittest.main()
