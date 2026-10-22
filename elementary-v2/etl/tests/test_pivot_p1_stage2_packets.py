"""Safety and completeness checks for stage2 source-review packets."""
import json
from pathlib import Path
import tempfile
import unittest

from etl.pivot_p1_stage2_packets import digest, numbered_lines, run


class Stage2PacketTests(unittest.TestCase):
    def cohort(self, root):
        source = root / 'input.txt'
        # A very long source line must remain intact rather than be clipped.
        source.write_text('school_id: fixture\nL1: [file: 2026 plan]\nL2: ' + 'A' * 15000
                          + '\nL3: tail programme\n', encoding='utf8')
        manifest = root / 'manifest.json'
        manifest.write_text(json.dumps({'cohort_size':39,'schools':[
            {'school_id':f'S{i}', 'school_name':f'School {i}', 'ready':True,
             'truncated':False, 'input_file':str(source), 'input_sha256':digest(source.read_bytes())}
            for i in range(39)]}), encoding='utf8')
        return manifest, source

    def test_full_bytes_and_every_numbered_line_survive_chunking(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); manifest, source = self.cohort(root)
            report = run(manifest, root/'packets', chunk_chars=100)
            self.assertFalse(report['source_review_complete'])
            self.assertFalse(report['blind_sample_verification_complete'])
            self.assertEqual(report['publish_status'],'not_approved')
            for school in report['schools']:
                self.assertEqual(Path(school['full_input']).read_bytes(),source.read_bytes())
                joined = ''.join(Path(c['file']).read_text(encoding='utf8') for c in school['chunks'])
                self.assertEqual(numbered_lines(joined),numbered_lines(source.read_text(encoding='utf8')))
                self.assertEqual(school['source_review_status'],'pending')

    def test_changed_last_input_blocks_the_entire_run_before_writing(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); manifest, _ = self.cohort(root)
            data=json.loads(manifest.read_text(encoding='utf8'))
            data['schools'][-1]['input_sha256']='stale'
            manifest.write_text(json.dumps(data),encoding='utf8')
            with self.assertRaisesRegex(ValueError,'Input changed'):
                run(manifest,root/'packets')
            self.assertFalse((root/'packets').exists())

    def test_truncated_input_and_duplicate_school_are_rejected(self):
        for change in ['truncated','duplicate']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as name:
                root=Path(name); manifest,_=self.cohort(root)
                data=json.loads(manifest.read_text(encoding='utf8'))
                if change=='truncated': data['schools'][0]['truncated']=True
                else: data['schools'][0]['school_id']=data['schools'][1]['school_id']
                manifest.write_text(json.dumps(data),encoding='utf8')
                with self.assertRaises(ValueError): run(manifest,root/'packets')
                self.assertFalse((root/'packets').exists())

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); manifest,_=self.cohort(root)
            folder=root/'packets'; folder.mkdir(); marker=folder/'reviewed.txt'
            marker.write_text('keep',encoding='utf8')
            with self.assertRaisesRegex(ValueError,'no existing files'):
                run(manifest,folder)
            self.assertEqual(marker.read_text(encoding='utf8'),'keep')

    def test_missing_or_duplicated_source_line_is_rejected(self):
        for text in ['L1: first\nL3: gap','L1: first\nL1: duplicate','L2: missing start','no numbered source']:
            with self.subTest(text=text), self.assertRaises(ValueError): numbered_lines(text)

    def test_image_only_schedule_remains_visible_and_hash_checked(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); manifest,_=self.cohort(root)
            image=root/'schedule.jpg'; image.write_bytes(b'original schedule fixture')
            source={'file':str(image),'sha256':digest(image.read_bytes()),'post_url':'https://school.example/schedule'}
            data=json.loads(manifest.read_text(encoding='utf8'))
            data['schools'][0]['supplemental_visual_sources']=[source]
            manifest.write_text(json.dumps(data),encoding='utf8')
            report=run(manifest,root/'packets')
            self.assertEqual(report['schools'][0]['supplemental_visual_sources'],[source])
            self.assertIn('supplemental_images_must_be_read_alongside_text',report['schools'][0]['risk_flags'])
            image.write_bytes(b'changed schedule fixture')
            with self.assertRaisesRegex(ValueError,'Visual source changed'):
                run(manifest,root/'second_run')
            self.assertFalse((root/'second_run').exists())


if __name__=='__main__':
    unittest.main()
