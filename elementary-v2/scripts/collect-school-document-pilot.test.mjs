import test from 'node:test'
import assert from 'node:assert/strict'
import { fileFormat, discoverDocumentAttachments, discoverBodyImages } from './collect-school-document-pilot.mjs'
const base = 'https://yy-e.goesn.kr/yy-e/na/ntt/selectNttInfo.do?nttSn=1'
test('file bytes, not extension, determine container type', () => {
  assert.equal(fileFormat(Buffer.from('%PDF-1.6')), 'pdf')
  assert.equal(fileFormat(Buffer.from('<html>not pdf</html>')), 'unknown')
  assert.equal(fileFormat(Buffer.from('504b0304', 'hex')), 'zip_container_unverified_hwpx')
})
test('observed DEXT filename/path tuple becomes same-origin source', () => {
  const html = "DEXT5UPLOAD.AddUploadedFile('1', '계획.pdf', '/upload/plan.pdf', '528834', 'id', G_UploadID);"
  assert.deepEqual(discoverDocumentAttachments(html, base), [{ title: '계획.pdf', url: 'https://yy-e.goesn.kr/upload/plan.pdf' }])
})
test('external DEXT attachment is not followed', () => assert.deepEqual(discoverDocumentAttachments("DEXT5UPLOAD.AddUploadedFile('1', '계획.pdf', 'https://other.example/plan.pdf', '1');", base), []))
test('ordinary href attachment survives and duplicates collapse', () => assert.equal(discoverDocumentAttachments('<a href="/upload/plan.pdf">계획.pdf</a><a href="/upload/plan.pdf">계획.pdf</a>', base).length, 1))
test('image magic bytes are recognised', () => {
  assert.equal(fileFormat(Buffer.from('89504e470d0a1a0a', 'hex')), 'png')
  assert.equal(fileFormat(Buffer.from('ffd8ffe0', 'hex')), 'jpeg')
})
test('scanned notice pasted into the post body is found; page chrome images are not', () => {
  const html = '<img src="/images/logo.png"><table><tr class="cont"><td><p><img src="/dext5editordata/2026/09/notice.png" alt="제3기 안내001"><img src="https://other.example/dext5editordata/x.png"></p></td></tr></table><img src="/dext5editordata/2026/09/outside.png">'
  assert.deepEqual(discoverBodyImages(html, base), [{ title: '제3기 안내001', url: 'https://yy-e.goesn.kr/dext5editordata/2026/09/notice.png' }])
})
test('post without a body row yields no images', () => assert.deepEqual(discoverBodyImages('<img src="/dext5editordata/a.png">', base), []))
