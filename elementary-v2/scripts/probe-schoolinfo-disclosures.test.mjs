import test from 'node:test'
import assert from 'node:assert/strict'
import { itemUrl, parseDisclosure, fileAcademicYear, classifyFile } from './probe-schoolinfo-disclosures.mjs'

// Trimmed from the real 15-라 response for the user's example school.
const html = `<option>(2차) 2026년 05월</option><option>(2차) 2025년 05월</option>
<a href="#none" class="file_name" onclick="getEiFile73('0');" title="x">2026학년도 내포초등학교 온돌봄(방과후·돌봄) 운영 계획.hwp(119 KB)</a>
<p class="intt"> 방과후학교 운영 현황[2026.4.30 기준] </p>`

test('disclosure period, attachment name/size and status date are read', () => {
  const parsed = parseDisclosure(html)
  assert.deepEqual(parsed.periods[0], { round: 2, year: 2026, month: 5 })
  assert.deepEqual(parsed.attachments, [{ file_seq: '0', name: '2026학년도 내포초등학교 온돌봄(방과후·돌봄) 운영 계획.hwp', size: '119 KB' }])
  assert.equal(parsed.status_as_of, '2026-04-30')
})
test('item without attachments yields none', () => assert.deepEqual(parseDisclosure('<option>(1차) 2026년 04월</option>').attachments, []))
test('academic year comes from the file name, not the disclosure year', () => {
  assert.equal(fileAcademicYear('2025학년도 학교교육과정 운영계획.hwp'), 2025)
  assert.equal(fileAcademicYear('학교교육과정 운영계획(수정).hwp'), null)
})
test('file kinds', () => {
  assert.equal(classifyFile('2026 온돌봄(방과후·돌봄) 운영 계획.hwp'), 'afterschool_care_plan')
  assert.equal(classifyFile('2026학년도 학사일정.pdf'), 'academic_calendar')
  assert.equal(classifyFile('2026학년도 학교교육과정 운영계획(수정).hwp'), 'curriculum_plan')
})
test('request URL is the public item endpoint with the page parameters', () => {
  const url = new URL(itemUrl('curriculum', 'abc', '한솔초등학교', '2026'))
  assert.equal(url.origin + url.pathname, 'https://www.schoolinfo.go.kr/ei/pp/Pneipp_b14_s0p.do')
  assert.equal(url.searchParams.get('SHL_IDF_CD'), 'abc')
  assert.equal(url.searchParams.get('JG_YEAR'), '2026')
})
