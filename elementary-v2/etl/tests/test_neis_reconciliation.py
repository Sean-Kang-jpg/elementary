import json
import unittest
from etl.audit_neis_crosswalk import EVIDENCE, address_key, reconcile


class NeisReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.school = {'school_id': 'B1', 'schoolinfo_code': 'S1', 'school_name': '샘플초등학교', 'neis_office_code': 'E10', 'road_address': '인천광역시 중구 신도시남로 43'}
        self.candidate = {'ATPT_OFCDC_SC_CODE': 'E10', 'SD_SCHUL_CODE': '1234567', 'SCHUL_NM': '샘플초등학교', 'SCHUL_KND_SC_NM': '초등학교', 'ORG_RDNMA': '인천광역시 영종구 신도시남로 43'}
        self.basic = {'SCHUL_CODE': 'S1', 'SCHUL_NM': '샘플초등학교', 'SCHUL_RDNMA': self.candidate['ORG_RDNMA']}

    def test_existing_etl_district_rule_with_independent_schoolinfo(self):
        result = reconcile(self.school, [self.candidate], [self.basic])
        self.assertEqual(result['neis_school_code'], '1234567')
        self.assertEqual(result['district_update_used'], '영종구')

    def test_merged_prefix_uses_existing_registry(self):
        self.assertEqual(address_key('전남광주통합특별시 무안군 일로읍 길 81-7'), address_key('전라남도 무안군 일로읍 길 81-7'))
        self.assertEqual(address_key('전남광주통합특별시 광산구 길 1'), address_key('광주광역시 광산구 길 1'))

    def test_changed_street_never_adopts_district(self):
        self.candidate['ORG_RDNMA'] = self.basic['SCHUL_RDNMA'] = '인천광역시 영종구 다른길 1'
        self.assertIsNone(reconcile(self.school, [self.candidate], [self.basic])['neis_school_code'])

    def test_neis_schoolinfo_contradiction_stays_held(self):
        self.basic['SCHUL_RDNMA'] = '인천광역시 영종구 다른길 1'
        self.assertIsNone(reconcile(self.school, [self.candidate], [self.basic])['neis_school_code'])

    def test_missing_or_ambiguous_schoolinfo_never_auto_accepts(self):
        for basics in ([], [self.basic, self.basic]):
            self.assertEqual(reconcile(self.school, [self.candidate], basics)['status'], 'hold_schoolinfo_identity')

    def test_office_and_name_remain_required(self):
        for key, wrong in (('ATPT_OFCDC_SC_CODE', 'J10'), ('SCHUL_NM', '다른초등학교')):
            candidate = {**self.candidate, key: wrong}
            self.assertIsNone(reconcile(self.school, [candidate], [self.basic])['neis_school_code'])

    def test_ambiguous_neis_codes_stay_held(self):
        other = {**self.candidate, 'SD_SCHUL_CODE': '7654321'}
        self.assertEqual(reconcile(self.school, [self.candidate, other], [self.basic])['status'], 'hold_ambiguous')

    def test_saved_reconciliation_preserves_fixed_population(self):
        result = json.loads((EVIDENCE / 'neis_reconciled_crosswalk_20261006.json').read_text(encoding='utf-8'))
        manifest = json.loads((EVIDENCE / 'poc_school_manifest_20261006.json').read_text(encoding='utf-8'))
        self.assertEqual({r['school_id'] for r in result['crosswalk']}, {r['school_id'] for r in manifest['schools']})
        verified = [r for r in result['crosswalk'] if r['neis_school_code']]
        self.assertEqual(len(verified), 59)
        self.assertEqual(len({(r['neis_office_code'], r['neis_school_code']) for r in verified}), 59)
        held = [r for r in result['crosswalk'] if not r['neis_school_code']]
        self.assertEqual([r['school_id'] for r in held], ['B000006819'])
        self.assertTrue(all(r['publish_status'] == 'not_approved' for r in verified))

    def test_reconciled_samples_only_use_verified_codes(self):
        result = json.loads((EVIDENCE / 'neis_reconciled_samples_20261006.json').read_text(encoding='utf-8'))
        verified = {r['school_id']: r for r in result['crosswalk'] if r['neis_school_code']}
        self.assertEqual(len(result['samples']), 10)
        self.assertEqual(len({s['school_id'] for s in result['samples']}), 5)
        self.assertEqual(sum(s['total'] for s in result['samples']), 376)
        self.assertEqual(sum(len(s['rows']) for s in result['samples']), 120)
        for sample in result['samples']:
            self.assertEqual(sample['params']['SD_SCHUL_CODE'], verified[sample['school_id']]['neis_school_code'])
            self.assertIsNone(sample['start_time'])
            self.assertIsNone(sample['end_time'])
            self.assertEqual(sum(p['row_count'] for p in sample['pages']), sample['total'])


if __name__ == '__main__':
    unittest.main()
