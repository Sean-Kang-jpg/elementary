"""Stage2 audit rejects changed evidence and never turns partial data into approval."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from etl.pivot_p1_stage2_audit import evaluate,validate_rows


def write(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Stage2AuditTests(unittest.TestCase):
    def fixture(self,root):
        source=root/'source.pdf';source.write_bytes(b'original source fixture')
        document_hash=hashlib.sha256(source.read_bytes()).hexdigest()
        numbered=root/'input.txt';numbered.write_text('L1: header\nL2: class table\n',encoding='utf8')
        input_hash=hashlib.sha256(numbered.read_bytes()).hexdigest()
        schools=[{'school_id':f'S{i}','ready':True,'truncated':False,'input_file':str(numbered),
                  'input_sha256':input_hash,'source_files':[{'sha256':document_hash}]} for i in range(39)]
        manifest=root/'manifest.json';write(manifest,{'cohort_size':39,'schools':schools})
        rows=[['맞춤형','책놀이',None,'통합반','1~2학년','row','월',None,None,'true','학기','2026',None,2]]
        output=root/'output.json';output_hash=write(output,[{'school_id':'S0','rows':rows}])
        assessment={'school_id':'S0','school_name':'School','input_file':str(numbered),'input_sha256':input_hash,
                    'source_files':[{'file':str(source),'sha256':document_hash}],
                    'output_file':str(output),'output_sha256':output_hash,'source_read_lines':[1,2],
                    'inventory':{'raw_total':1,'paid':0,'custom_regular_mixed':1},
                    'row_decisions':[{'row':1,'verdict':'source_faithful'}],
                    'participation_groups':[{'group_id':'G','mode':'class_day_bundle','rows':[1],
                                             'individually_selectable':False,'evidence':{'lines':[2]}}],
                    'conditional_rows':[{'rows':[1],'condition':'only if overflow','evidence_lines':[2],
                                         'confirmed_operating':False}],
                    'grade1_custom_inventory_complete':True,'blocking_issues':['missing times']}
        review=root/'review.json';write(review,{'schema_version':'pivot-p1-stage2-manual-source-review-v1',
                                               'schools':[assessment]})
        return manifest,review,assessment,rows

    def test_partial_cohort_null_clocks_and_conditions_remain_unapproved(self):
        with tempfile.TemporaryDirectory() as name:
            manifest,review,_,_=self.fixture(Path(name));result=evaluate(manifest,review)
            self.assertEqual(result['schools_with_source_extraction'],1)
            self.assertEqual(len(result['remaining_school_ids']),38)
            self.assertFalse(result['all_39_source_extracted'])
            self.assertFalse(result['independent_blind_review_complete'])
            self.assertEqual(result['publish_status'],'not_approved')
            school=result['schools'][0]
            self.assertEqual(school['mandatory_grade1_custom_gaps'],[1])
            self.assertEqual(school['unconfirmed_conditional_rows'],[1])
            self.assertFalse(school['ready_for_operational_review'])

    def test_each_changed_source_or_output_is_rejected(self):
        for target in ['numbered','original','output']:
            with self.subTest(target=target),tempfile.TemporaryDirectory() as name:
                root=Path(name);manifest,review,a,_=self.fixture(root)
                path=Path(a['input_file'] if target=='numbered' else a['output_file'] if target=='output'
                          else a['source_files'][0]['file'])
                path.write_bytes(path.read_bytes()+b'changed')
                with self.assertRaisesRegex(ValueError,'Fingerprint changed'):evaluate(manifest,review)

    def test_incomplete_decisions_bad_read_coverage_and_duplicate_school_are_rejected(self):
        for target in ['decisions','read_coverage','duplicate','original_manifest']:
            with self.subTest(target=target),tempfile.TemporaryDirectory() as name:
                root=Path(name);manifest,review,a,_=self.fixture(root)
                data=json.loads(review.read_text(encoding='utf8'))
                if target=='decisions':data['schools'][0]['row_decisions']=[]
                elif target=='read_coverage':data['schools'][0]['source_read_lines']=[2,2]
                elif target=='duplicate':data['schools'].append(a)
                else:
                    changed=json.loads(manifest.read_text(encoding='utf8'))
                    changed['schools'][0]['source_files'][0]['sha256']='wrong';write(manifest,changed)
                write(review,data)
                with self.assertRaises(ValueError):evaluate(manifest,review)

    def test_bundle_cannot_be_made_an_individually_selectable_course(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);manifest,review,_,_=self.fixture(root)
            data=json.loads(review.read_text(encoding='utf8'))
            data['schools'][0]['participation_groups'][0]['individually_selectable']=True
            write(review,data)
            with self.assertRaisesRegex(ValueError,'individual choices'):evaluate(manifest,review)

    def test_invalid_source_clock_contact_and_weekend_scope_are_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            _,_,_,rows=self.fixture(Path(name))
            for column,value in [(13,99),(7,'25:00'),(1,'teacher 010-1234-5678'),(6,'토')]:
                row=rows[0].copy();row[column]=value
                with self.subTest(column=column),self.assertRaises(ValueError):validate_rows([row],{1,2})

    def test_closed_course_cannot_be_reported_as_operating(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);manifest,review,a,rows=self.fixture(root)
            a['excluded_closed_rows']=[{'name':'책놀이','section':'통합반','days':'월',
                                       'status':'closed_in_source_plan','evidence_lines':[2]}]
            write(review,{'schema_version':'pivot-p1-stage2-manual-source-review-v1','schools':[a]})
            with self.assertRaisesRegex(ValueError,'source-closed class'):
                evaluate(manifest,review)
            a['excluded_closed_rows'][0]['name']='other closed course'
            write(review,{'schema_version':'pivot-p1-stage2-manual-source-review-v1','schools':[a]})
            self.assertEqual(evaluate(manifest,review)['schools'][0]['excluded_closed_rows'],1)

    def test_care_activity_hours_are_separate_from_activity_time(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);manifest,review,a,rows=self.fixture(root)
            rows[0][12]='돌봄내';rows[0][7:9]=['14:00','15:00']
            a['output_sha256']=write(Path(a['output_file']),[{'school_id':'S0','rows':rows}])
            a['participation_groups'][0]['mode']='care_activity'
            for complete in [False,True]:
                a['care_hours_review_complete']=complete
                a['care_hours']={'days':'월화수목금','start_basis':'after_regular_classes',
                                 'end':'17:00','evidence':{'lines':[2]}}
                write(review,{'schema_version':'pivot-p1-stage2-manual-source-review-v1','schools':[a]})
                result=evaluate(manifest,review)['schools'][0]
                self.assertEqual(result['care_activity_hours_verified'],complete)
                self.assertEqual(result['care_regular'],1)
                self.assertFalse(result['ready_for_operational_review'])


if __name__=='__main__':
    unittest.main()
