"""P1 regression: a separate care HWP must not hide the programme PDF."""
import tempfile
import io
import zipfile
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.llm_extraction_inputs_v3 import write_input
from etl.school_document_tables import hwpx_grid_text


class PivotP1V3InputTests(unittest.TestCase):
    def test_full_document_keeps_the_tail_beyond_the_legacy_cap(self):
        with tempfile.TemporaryDirectory() as folder:
            docs, out = Path(folder) / 'docs', Path(folder) / 'out'
            docs.mkdir(); out.mkdir()
            (docs / 'long.hwpx').write_bytes(b'fixture')
            text = 'A' * 100050 + '\nTAIL: final programme row'
            school = {'school_id': 'X', 'files': [{'name': 'plan.hwpx', 'sha256': 'long'}]}
            with patch('etl.llm_extraction_inputs_v3.DOCS', docs), patch(
                    'etl.llm_extraction_inputs_v3.grid_text', return_value=('hwpx', text)):
                capped = write_input(school, out)
                self.assertTrue(capped['truncated'])
                full = write_input(school, out, max_chars=None)
            self.assertFalse(full['truncated'])
            self.assertIn('TAIL: final programme row', (out / 'X.txt').read_text(encoding='utf8'))

    def write(self, files):
        with tempfile.TemporaryDirectory() as folder:
            docs, out = Path(folder) / "docs", Path(folder) / "out"
            docs.mkdir()
            out.mkdir()
            for source in files:
                (docs / f"{source['sha256']}{Path(source['name']).suffix}").write_bytes(
                    source["sha256"].encode())
            with patch("etl.llm_extraction_inputs_v3.DOCS", docs), patch(
                "etl.llm_extraction_inputs_v3.grid_text",
                side_effect=lambda data: ("fixture", data.decode()),
            ):
                report = write_input({"school_id": "X", "files": files}, out)
            return report, (out / "X.txt").read_text(encoding="utf8")

    def test_distinct_care_hwp_keeps_course_pdf(self):
        report, text = self.write([
            {"name": "2026 돌봄교실 운영계획.hwp", "sha256": "care"},
            {"name": "2026 방과후 맞춤형 운영계획.pdf", "sha256": "courses"},
        ])
        self.assertEqual(report["files"], 2)
        self.assertIn("courses", text)

    def test_same_named_pdf_prefers_structured_copy(self):
        report, text = self.write([
            {"name": "2026 운영계획.hwpx", "sha256": "grid"},
            {"name": "2026 운영계획.pdf", "sha256": "duplicate"},
        ])
        self.assertEqual(report["files"], 1)
        self.assertIn("grid", text)
        self.assertNotIn("duplicate", text)

    def test_nested_hwpx_table_preserves_weekday_columns(self):
        xml = '''<section><tbl><tr><tc><subList><p><run><tbl>
          <tr><tc><t>월</t><cellAddr colAddr="0" rowAddr="0"/></tc>
              <tc><t>화</t><cellAddr colAddr="1" rowAddr="0"/></tc></tr>
          <tr><tc><t>로봇세상</t><cellAddr colAddr="0" rowAddr="1"/></tc>
              <tc><t>책놀이</t><cellAddr colAddr="1" rowAddr="1"/></tc></tr>
          </tbl></run></p></subList><cellAddr colAddr="0" rowAddr="0"/>
          </tc></tr></tbl></section>'''
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('Contents/section0.xml', xml)
        result = hwpx_grid_text(data.getvalue())
        self.assertIn('월 | 화 |', result)
        self.assertIn('로봇세상 | 책놀이 |', result)


if __name__ == "__main__":
    unittest.main()
