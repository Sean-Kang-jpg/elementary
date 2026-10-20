import copy
import unittest

from etl.load_school_afterschool import assert_no_school_loss
from etl.publish_seoul_gap37_append import build_sql, build_rollback_sql, validate


def payload():
    summary={'school_id':'S1','source_year':2026,'tier':'C','grade1_options':1,'custom_options':0,
             'unknown_grade_options':0,**{f'latest_end_{d}':None for d in ('mon','tue','wed','thu','fri')},
             'timeline_basis':None,'term_label':None,'source':'fixture','review_state':'auto','snapshot_date':'2026-10-19'}
    programme={'school_id':'S1','seq':1,'kind':'방과후','name':"Kids' art",'variant':None,'section':None,
               'category':'기타','grade1':'true','grades_raw':'1~2학년','grade_upper':2,
               'weekdays':None,'start_time':None,'end_time':None,'term':None}
    return {'school_afterschool_summary':[summary],'school_afterschool_programs':[programme]}


class AppendReleaseTest(unittest.TestCase):
    def test_partial_legacy_apply_refuses_school_loss(self):
        with self.assertRaisesRegex(ValueError,'before writes'):
            assert_no_school_loss([{'school_id':'new'}],{'old1','old2'})

    def test_complete_legacy_apply_accepts_existing_plus_new(self):
        assert_no_school_loss([{'school_id':'old'},{'school_id':'new'}],{'old'})

    def test_list_only_gate_rejects_clock_even_when_tier_c(self):
        p=payload();p['school_afterschool_programs'][0]['start_time']='13:00'
        with self.assertRaisesRegex(ValueError,'programme gate'):validate(p)

    def test_custom_grade_is_not_guessed_from_policy(self):
        p=payload();p['school_afterschool_programs'][0].update(kind='맞춤형',grade1='unknown',grades_raw=None)
        with self.assertRaisesRegex(ValueError,'policy-default'):validate(p)

    def test_transaction_uses_insert_only_and_dry_run_default(self):
        sql=build_sql(payload(),['S1'],{'S1'})
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        self.assertNotIn('DELETE FROM',sql)
        self.assertNotIn('UPDATE public.',sql)
        self.assertNotIn('CREATE ',sql)
        self.assertIn('LOCK TABLE',sql)
        self.assertIn('Partial/different target rows exist; abort',sql)
        self.assertIn("Kids'' art",sql)
        self.assertIn('Existing programmes changed; abort',sql)

    def test_commit_is_explicit_and_batch_ids_are_checked(self):
        self.assertTrue(build_sql(payload(),['S1'],{'S1'},True).rstrip().endswith('COMMIT;'))
        with self.assertRaises(ValueError):build_sql(payload(),['other'],{'S1'})

    def test_rollback_only_deletes_guarded_release_scope(self):
        sql=build_rollback_sql(payload(),['S1'],{'S1','S2'})
        self.assertNotIn('INSERT INTO',sql)
        self.assertIn('Rollback target missing; abort',sql)
        self.assertIn('Partial/different target rows exist; abort',sql)
        self.assertIn("DELETE FROM public.school_afterschool_programs WHERE school_id IN ('S1');",sql)
        self.assertNotIn("DELETE FROM public.school_afterschool_programs WHERE school_id IN ('S1','S2')",sql)
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))


if __name__=='__main__':unittest.main()
