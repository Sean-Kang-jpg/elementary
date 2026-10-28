import unittest

from etl.build_pivot_priority_slots import packet


def row(name='미술', grade='1~2', grade1='true', start='13:00', end='14:20'):
    return ['방과후', name, None, 'A', grade, 'row' if grade else None,
            '월', start, end, grade1, '학기', '2026 연간', None, 10]


class PrioritySlotPacketTests(unittest.TestCase):
    def make(self, rows, issues=None, pdf=False):
        return packet({'school_id':'school', 'rows':rows},
                      {'blocking_issues':issues or []},
                      {'school_name':'학교', 'sources':[{'format':'pdf' if pdf else 'hwp'}]})

    def test_four_kinds_and_same_window_deduplication(self):
        custom=row('놀이');custom[0]='맞춤형';custom[12]='돌봄내'
        result=self.make([row(),row('로봇'),row(grade='1~6'),
                          row(grade=None,grade1='unknown'),custom,row(grade='3~6',grade1='false')])
        self.assertEqual(len(result['slots']),4)
        self.assertEqual({s['kind'] for s in result['slots']},
                         {'맞춤형','저학년방과후','전학년방과후','학년미기재방과후'})
        lower=next(s for s in result['slots'] if s['kind']=='저학년방과후')
        self.assertEqual(lower['source_rows'],[1,2])

    def test_names_and_duplicate_rows_do_not_gate_slots(self):
        issues=[{'code':'programme_name_source_conflict','lines':[10,20]},
                {'code':'duplicate_source_rows','lines':[10,11]}]
        result=self.make([row(),row()],issues)
        self.assertEqual(result['status'],'ok')
        self.assertEqual(len(result['slots']),1)
        self.assertEqual(result['conflicts'],[])
        self.assertEqual(len(result['reference_findings']),2)

    def test_clock_conflict_is_structured_and_not_approved(self):
        result=self.make([row()],[{'code':'source_duration_conflict','lines':[10,11]}])
        self.assertEqual(result['conflicts'],[['시각','미술 A','L10 / L11']])
        self.assertEqual(result['status'],'check')
        self.assertFalse(result['approved_for_upload'])

    def test_unknown_schedule_is_not_no_operation(self):
        result=self.make([row(grade=None,grade1='unknown',start=None,end=None)])
        self.assertEqual(result['slots'],[])
        self.assertEqual(result['status'],'check')
        self.assertEqual(result['checks'][0][0],'방과후시각미확인')

    def test_pdf_only_and_untimed_custom_need_checks(self):
        self.assertEqual(self.make([row()],pdf=True)['status'],'check')
        custom=row(start=None,end=None);custom[0]='맞춤형'
        self.assertEqual(self.make([custom])['checks'][0][:2],['맞춤형시각없음','월'])

    def test_care_classification_candidate_stays_on_review_queue(self):
        custom=row();custom[0]='맞춤형';custom[12]='돌봄내'
        result=self.make([custom],[{'code':'care_custom_classification_pending','lines':[10]}])
        self.assertEqual(result['status'],'check')
        self.assertEqual(result['checks'][0][0],'돌봄내분류확인')

    def test_grade_conflict_is_a_slot_gate(self):
        result=self.make([row()],[{'code':'grade_source_conflict','lines':[10,20]}])
        self.assertEqual(result['conflicts'][0][0],'학년')
        self.assertEqual(result['status'],'check')


if __name__ == '__main__':
    unittest.main()
