import unittest

from etl.pivot_p1_slot_review import packet, source_conflicts


def row(kind='맞춤형', grades='1~2학년', day='월', start='13:00', end='14:20'):
    return [kind, '놀이', None, 'A', grades, 'row', day, start, end,
            'true', '학기', '2026 연간', None, 1]


class Builder:
    """Small contract double; the real shared builder is tested in its own tree."""
    @staticmethod
    def slot_kind(r):
        if r['period'] != '학기' or r['grade1'] == 'false':
            return None
        if r['kind'] == '맞춤형':
            return '맞춤형'
        return '저학년방과후' if r['grades_raw'] == '1~2학년' else '전학년방과후'

    @staticmethod
    def school_slots(rows, conflicts, pdf_only):
        slots = []
        checks = [['원문불일치', c[0], c] for c in conflicts]
        for r in rows:
            if r['start'] and r['end'] and r['days']:
                for day in r['days']:
                    slots.append({'kind': Builder.slot_kind(r), 'weekday': day,
                                  'start': r['start'], 'end': r['end'], 'courses': [r['name']],
                                  'place': r['place'], 'time_source': r.get('time_source')})
        if pdf_only and slots:
            checks.append(['PDF원문', None, None])
        return {'slots': slots, 'checks': checks,
                'status': 'check' if checks else 'ok' if slots else 'none'}


class SlotReviewTest(unittest.TestCase):
    def school(self, rows, **kwargs):
        return {'school_id': 'test', 'rows': rows, **kwargs}

    def test_reference_all_grade_and_morning_are_not_core_candidates(self):
        morning = row(); morning[10] = '아침'
        result = packet(self.school([row('방과후', '1~6학년'), morning,
                                     row('방과후')]), {}, Builder, False)
        self.assertEqual(len(result['candidate_slots']), 1)
        self.assertEqual(result['candidate_slots'][0][1], '저학년방과후')

    def test_period_conditions_stay_unresolved_without_weekday_counts(self):
        result = packet(self.school([row(start=None, end=None)],
                                    period_slots={'4': ['13:00', '14:20']}), {}, Builder, False)
        self.assertEqual(result['candidate_slots'], [])
        self.assertEqual(result['status'], 'check')
        self.assertEqual(result['checks'][-1][0], '교시요일배정미확인')

    def test_only_custom_rows_can_inherit_custom_period_conditions(self):
        rows = [row(grades='1학년', day='월화', start=None, end=None),
                row('방과후', start=None, end=None)]
        result = packet(self.school(rows, period_slots={'4': ['13:00', '14:20'],
                                                      '5': ['13:50', '15:10']}), {}, Builder, False,
                        {'월': 4, '화': 5})
        self.assertEqual([(s['weekday'], s['start']) for s in result['slots']],
                         [('월', '13:00'), ('화', '13:50')])
        self.assertTrue(all(s['kind'] == '맞춤형' for s in result['slots']))

    def test_conditional_core_rows_need_check_even_with_times(self):
        assessment = {'conditional_rows': [{'rows': [1, 2], 'confirmed_operating': False}]}
        result = packet(self.school([row(), row('방과후', '1~6학년')]), assessment, Builder, False)
        self.assertEqual(result['checks'][-1], ['조건부개설미확인', None, [1]])
        self.assertEqual(result['status'], 'check')

    def test_existing_conflicts_do_not_hide_older_clock_conflicts(self):
        school = self.school([row()], conflicts=[['학년', 'A', 'L2 / L3']])
        a = {'field_conflicts': [{'rows': [1], 'alternatives': [{'line': 4}, {'line': 5}]}]}
        self.assertEqual(source_conflicts(school, a),
                         [['학년', 'A', 'L2 / L3'], ['시각', '놀이', 'L4 / L5']])

    def test_malformed_conflict_is_rejected(self):
        with self.assertRaises(ValueError):
            source_conflicts(self.school([], conflicts=[['강좌명', 'A', 'L1']]), {})

    def test_pdf_check_and_care_place_are_preserved(self):
        r = row(); r[12] = '돌봄내'
        result = packet(self.school([r]), {}, Builder, True)
        self.assertEqual(result['slots'][0]['place'], '돌봄내')
        self.assertEqual(result['status'], 'check')
        self.assertFalse(result['publish_ready'])

    def test_prior_year_table_is_not_a_current_slot(self):
        r = row(); r[11] = '2025 1기'
        self.assertEqual(packet(self.school([r]), {}, Builder, False)['candidate_slots'], [])

    def test_timed_care_does_not_hide_untimed_independent_custom(self):
        care = row(); care[12] = '돌봄내'
        result = packet(self.school([care, row(start=None, end=None)]), {}, Builder, False)
        self.assertEqual(result['status'], 'check')
        self.assertIn(['맞춤형미확정행', None, [2]], result['checks'])

    def test_conflict_evidence_must_be_within_the_read_source(self):
        school = self.school([], conflicts=[['시각', 'A', 'L2 / L99']])
        with self.assertRaises(ValueError):
            source_conflicts(school, {'source_read_lines': [1, 10]})


if __name__ == '__main__':
    unittest.main()
