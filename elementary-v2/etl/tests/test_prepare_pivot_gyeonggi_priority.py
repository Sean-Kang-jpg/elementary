import tempfile
import unittest
from pathlib import Path

from etl.prepare_pivot_gyeonggi_priority import care_windows, digest, document_input, select_schools


class PriorityPreparationTests(unittest.TestCase):
    def test_scope_excludes_seoul_wirye_and_other_gyeonggi_areas(self):
        rows = [
            {'school_id': 'gg', 'area': 'wirye', 'road_address': '경기도 하남시 위례'},
            {'school_id': 'seoul', 'area': 'wirye', 'road_address': '서울특별시 송파구'},
            {'school_id': 'other', 'area': 'gangnam', 'road_address': '경기도 성남시'},
        ]
        self.assertEqual([s['school_id'] for s in select_schools({'schools': rows})], ['gg'])

    def test_duplicate_and_empty_scope_are_rejected(self):
        row = {'school_id': 'one', 'area': 'bundang', 'road_address': '경기도 성남시 분당구'}
        for rows in ([], [row, row]):
            with self.assertRaises(ValueError):
                select_schools({'schools': rows})

    def test_distinct_pdf_is_kept_and_long_document_not_truncated(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory)
            data = [b'structured', b'pdf']
            attachments = []
            for content, name, extension in zip(data, ['care.hwpx', 'courses.pdf'], ['hwpx', 'pdf']):
                sha = digest(content)
                (archive / f'{sha}.{extension}').write_bytes(content)
                attachments.append({'sha256': sha, 'name': name, 'file_academic_year': 2026})
            text, sources, errors = document_input(
                {'school_id': 'one', 'school_name': 'Test'}, {'files': attachments}, archive,
                lambda content: ('test', 'x' * 100001 + '\nLAST_' + content.decode()))
            self.assertEqual(len(sources), 2)
            self.assertFalse(errors)
            self.assertIn('LAST_structured', text)
            self.assertIn('LAST_pdf', text)
            self.assertIn('courses.pdf', text)

    def test_corrupt_missing_and_empty_sources_are_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory)
            sha = digest(b'original')
            (archive / f'{sha}.hwp').write_bytes(b'changed')
            empty_sha = digest(b'empty')
            (archive / f'{empty_sha}.hwp').write_bytes(b'empty')
            _, sources, errors = document_input(
                {'school_id': 'one', 'school_name': 'Test'},
                {'files': [{'sha256': sha}, {'sha256': digest(b'missing')}, {'sha256': empty_sha}]},
                archive, lambda _: ('hwp', ''))
            self.assertEqual(sources, [])
            self.assertEqual(len(errors), 3)
            self.assertIn('hash mismatch', errors[0])
            self.assertIn('found 0', errors[1])
            self.assertIn('empty', errors[2])

    def test_evidence_windows_are_locators_without_inferred_fields(self):
        lines = ['header', '돌봄 운영', '학기중 13:00~17:00', '방학 09:00~15:00', 'tail']
        windows = care_windows(lines)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]['first_line'], 1)
        self.assertIn('L3: 학기중 13:00~17:00', windows[0]['text'])
        self.assertNotIn('afternoon_end', windows[0])

    def test_image_only_pdf_markers_do_not_count_as_text(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory)
            sha = digest(b'image-pdf')
            (archive / f'{sha}.pdf').write_bytes(b'image-pdf')
            _, sources, errors = document_input(
                {'school_id': 'one', 'school_name': 'Test'}, {'files': [{'sha256': sha}]},
                archive, lambda _: ('pdf', '##### PAGE 1\n##### PAGE 2\n'))
            self.assertFalse(sources)
            self.assertIn('empty', errors[0])

    def test_override_is_bound_to_both_original_and_recovered_text(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory)
            sha = digest(b'xlsx')
            (archive / f'{sha}.hwpx').write_bytes(b'xlsx')
            recovered = archive / 'recovered.txt'
            recovered.write_text('월 | 미술 | 13:00~14:20', encoding='utf-8')
            override = {sha: {'text_file': str(recovered), 'text_sha256': digest(recovered.read_bytes()), 'format': 'xlsx'}}
            args = ({'school_id': 'one', 'school_name': 'Test'}, {'files': [{'sha256': sha}]},
                    archive, lambda _: ('hwpx', ''))
            text, sources, errors = document_input(*args, override)
            self.assertFalse(errors)
            self.assertIn('미술', text)
            self.assertEqual(sources[0]['format'], 'xlsx')
            recovered.write_text('changed', encoding='utf-8')
            _, sources, errors = document_input(*args, override)
            self.assertFalse(sources)
            self.assertIn('override text hash mismatch', errors[0])


if __name__ == '__main__':
    unittest.main()
