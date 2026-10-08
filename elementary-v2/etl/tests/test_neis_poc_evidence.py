"""Saved public evidence integrity; not document extraction or clock accuracy."""
import json
import re
import unittest

from etl.audit_product_schema import PROJECT


class NeisPocEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = PROJECT / 'docs/research/audit2'
        cls.evidence = json.loads((base / 'neis_poc_evidence_20261006.json').read_text(encoding='utf-8'))
        cls.manifest = json.loads((base / 'poc_school_manifest_20261006.json').read_text(encoding='utf-8'))
        cls.review = json.loads((base / 'neis_crosswalk_review_20261006.json').read_text(encoding='utf-8'))

    def test_fixed_denominator_and_preserved_identifiers(self):
        expected = {s['school_id']: s for s in self.manifest['schools']}
        self.assertEqual(len(self.evidence['crosswalk']), 60)
        self.assertEqual({r['school_id'] for r in self.evidence['crosswalk']}, set(expected))
        for row in self.evidence['crosswalk']:
            self.assertEqual(row['schoolinfo_code'], expected[row['school_id']]['schoolinfo_code'])
        self.assertTrue(self.evidence['no_operational_upload'])

    def test_verified_identity_unique_and_reproducible(self):
        verified = [r for r in self.evidence['crosswalk'] if r['neis_school_code']]
        self.assertEqual(len(verified), 47)
        self.assertEqual(len({(r['neis_office_code'], r['neis_school_code']) for r in verified}), 47)
        expected = {s['school_id']: s for s in self.manifest['schools']}
        normalize = lambda value: re.sub(r'[\s,]', '', re.sub(r'\([^)]*\)', '', value))
        for row in verified:
            self.assertRegex(row['neis_school_code'], r'^\d{7}$')
            candidates = [c for c in row['candidates'] if c['SD_SCHUL_CODE'] == row['neis_school_code']]
            self.assertEqual(len(candidates), 1)
            self.assertEqual(normalize(candidates[0]['ORG_RDNMA']), normalize(expected[row['school_id']]['road_address']))

    def test_all_holds_remain_unapproved(self):
        held = {r['school_id'] for r in self.evidence['crosswalk'] if not r['neis_school_code']}
        self.assertEqual(len(held), 13)
        self.assertEqual(held, {r['school_id'] for r in self.review['holds']})
        self.assertTrue(all(r['decision'] == 'not_approved' for r in self.review['holds']))

    def test_page_totals_and_hashes(self):
        self.assertEqual(sum(s['total'] for s in self.evidence['school_info_pages']), 3039)
        for source in self.evidence['school_info_pages'] + self.evidence['samples']:
            self.assertEqual(sum(p['row_count'] for p in source['pages']), source['total'])
            for page in source['pages']:
                self.assertRegex(page['response_sha256'], r'^[0-9a-f]{64}$')
                self.assertEqual(page['code'], 'INFO-000')

    def test_samples_only_use_verified_codes_and_do_not_infer_clock(self):
        verified = {r['school_id']: r for r in self.evidence['crosswalk'] if r['neis_school_code']}
        self.assertEqual(len(self.evidence['samples']), 8)
        self.assertEqual(len({s['school_id'] for s in self.evidence['samples']}), 4)
        for sample in self.evidence['samples']:
            self.assertEqual(sample['params']['SD_SCHUL_CODE'], verified[sample['school_id']]['neis_school_code'])
            self.assertIsNone(sample['start_time'])
            self.assertIsNone(sample['end_time'])
            self.assertEqual(sample['evidence_state'], 'source_reported_2026_not_2027_confirmed')
            self.assertEqual(sample['captured_sample_rows'], len(sample['rows']))
            self.assertEqual(sample['sample_is_truncated'], sample['total'] > len(sample['rows']))

    def test_row_scope_and_no_credentials(self):
        serialized = json.dumps(self.evidence)
        self.assertNotIn('KEY=', serialized)
        self.assertNotIn('"KEY"', serialized)
        for sample in self.evidence['samples']:
            for row in sample['rows']:
                self.assertEqual(row['SD_SCHUL_CODE'], sample['params']['SD_SCHUL_CODE'])
                self.assertEqual(row['AY'], '2026')
                if 'ALL_TI_YMD' in row:
                    self.assertEqual(row['GRADE'], '1')
                    self.assertTrue('20260914' <= row['ALL_TI_YMD'] <= '20260918')
                if 'AA_YMD' in row:
                    self.assertTrue('20260901' <= row['AA_YMD'] <= '20261031')


if __name__ == '__main__':
    unittest.main()
