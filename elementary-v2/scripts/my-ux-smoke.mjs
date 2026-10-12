// Isolated browser-storage fixtures test MY interactions, not school eligibility.
// Run public-smoke separately for real map, assignment and SEO regression.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const prefix = ['--namespace', 'elementary-my-smoke', '--session', `my-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evalPage = (code) => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evalPage(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const click = (text) => evalPage(`[...document.querySelectorAll('.my-schedule button')].find(b => b.textContent === ${JSON.stringify(text)}).click(); true`)
try {
  run('set', 'viewport', '390', '844')
  run('open', new URL('/my', base).href)
  await wait("document.querySelector('#my-title')", 'MY opens')
  await wait("!document.querySelector('.my-preparation h2') && document.querySelector('.my-preparation')?.getAttribute('aria-label') === '입학연도'", 'redundant settings heading removed while accessible year region remains')
  await wait("document.querySelector('.my-preparation').nextElementSibling?.classList.contains('checklist-banner')", 'admission settings immediately precede checklist')
  await wait("!document.querySelector('.my-guides') && document.querySelector('.app-gnb a[href=\"/guide\"]')", 'MY guide banner removed while guide GNB remains')
  evalPage("document.querySelector('.hub-profile__edit')?.click(); true")
  await wait("document.querySelector('.my-preparation .year-chip')", 'year picker opens in top settings')
  evalPage("document.querySelector('.my-preparation .year-chip').click(); true")
  await wait("document.querySelector('.my-preparation .hub-profile') && document.querySelector('.my-preparation').nextElementSibling?.classList.contains('checklist-banner')", 'saved-year summary stays above checklist')
  await wait("!document.querySelector('.my-preparation h2')", 'saved-year summary has no redundant settings heading')
  evalPage(`localStorage.removeItem('elementary-schedule-plans-v1'); localStorage.removeItem('favorite-school-ids');
    localStorage.setItem('elementary-favorites-v1', JSON.stringify([
      {kind:'school',id:'qa-school-a',name:'QA 후보 A',address:'테스트용',latitude:0,longitude:0},
      {kind:'school',id:'qa-school-b',name:'QA 후보 B',address:'테스트용',latitude:0,longitude:0},
      {kind:'apartment',id:'qa-apartment',name:'QA 아파트',address:'테스트용',latitude:0,longitude:0,schoolId:'qa-school-a',schoolName:'QA 후보 A',households:0}
    ])); location.reload(); true`)
  await wait("document.querySelectorAll('.my-saved li').length === 2", 'school candidates separate from apartment')
  await wait("document.querySelector('.checklist-banner').compareDocumentPosition(document.querySelector('.my-schedule')) & Node.DOCUMENT_POSITION_FOLLOWING", 'checklist precedes schedule')
  click('자료 없이 직접 만들기')
  await wait("document.querySelector('.my-entry-form')", 'manual draft without invented school hours')
  evalPage("document.querySelector('.my-entry-form').open = true; true")
  run('fill', '.my-entry-form input:not([type])', '미술 후보')
  run('fill', '.my-time-fields label:first-child input', '14:00')
  run('fill', '.my-time-fields label:last-child input', '15:00')
  click('후보 일정 저장')
  await wait("document.querySelector('.my-week').textContent.includes('미술 후보')", 'new course is considering, not confirmed')
  click('내 시간표로 사용')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-a'", 'select primary draft')
  evalPage("document.querySelector('.my-schedule > .my-field select').value='qa-school-b'; document.querySelector('.my-schedule > .my-field select').dispatchEvent(new Event('change',{bubbles:true})); true")
  click('자료 없이 직접 만들기')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.length === 2", 'second candidate has independent draft')
  click('내 시간표로 사용')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-b'", 'switch primary without deleting first draft')
  evalPage("location.reload(); true")
  await wait("document.querySelector('.my-active-plan')?.textContent.includes('QA 후보 B')", 'reload restores active plan')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.find(p=>p.schoolId==='qa-school-a').entries[0].participation==='considering'", 'selection never confirms course participation')
  evalPage("[...document.querySelectorAll('[aria-label=\"관심 후보 유형\"] button')].find(b=>b.textContent.startsWith('아파트')).click(); true")
  await wait("document.querySelectorAll('.my-saved li').length === 1 && document.querySelector('.my-saved').textContent.includes('QA 아파트')", 'apartment tab remains independent')
  await wait("document.documentElement.scrollWidth <= innerWidth", 'mobile layout has no horizontal overflow')
  await wait("getComputedStyle(document.querySelector('.my-saved li')).display === 'block'", 'candidate actions stack below the card heading')
  await wait("document.querySelector('.my-week__day').getBoundingClientRect().height < 120", 'empty weekday rows stay compact')
  evalPage("[...document.querySelectorAll('[aria-label=\"관심 후보 유형\"] button')].find(b=>b.textContent.startsWith('학교')).click(); true")
  evalPage("document.querySelector('[aria-label=\"QA 후보 B 저장 삭제\"]').click(); true")
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-b' && document.querySelector('.my-schedule').textContent.includes('관심 학교에서 삭제한 초안')", 'favorite removal preserves active draft with explanation')
  evalPage("window.myOriginalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value){if(key==='elementary-schedule-plans-v1')throw new Error('test quota');return window.myOriginalSetItem.call(this,key,value)}; true")
  click('선택 해제')
  await wait("document.querySelector('.my-schedule [role=status]').textContent.includes('저장되지 않았어요') && JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-b'", 'quota failure does not show unsaved selection as saved')
  evalPage("Storage.prototype.setItem = window.myOriginalSetItem; true")
  if (process.argv[3]) run('screenshot', process.argv[3], '--full')
  run('set', 'viewport', '1280', '900')
  await wait("document.documentElement.scrollWidth <= innerWidth", 'desktop layout has no horizontal overflow')
  // Real public read path: restore a school from its detail, then expand MY information.
  evalPage("localStorage.removeItem('elementary-favorites-v1'); localStorage.removeItem('elementary-schedule-plans-v1'); true")
  run('open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', base).href)
  await wait("document.querySelector('[data-testid=bottom-sheet] button[aria-label=\"MY에 저장\"]')", 'real school detail loads')
  evalPage("document.querySelector('[data-testid=bottom-sheet] button[aria-label=\"MY에 저장\"]').click(); true")
  run('open', new URL('/my', base).href)
  await wait("document.querySelector('.my-candidate-toggle')", 'real school favorite is available in MY')
  evalPage("document.querySelector('.my-candidate-toggle').click(); true")
  await wait("document.querySelector('.my-candidate-info [data-testid=school-care]') && !document.querySelector('.my-candidate-info').textContent.includes('확인 중이에요')", 'MY renders real care disclosure and completes environment read')
  click('시간표 초안 만들기')
  await wait("document.querySelector('.my-entry-form')", 'real source import or explicit missing-data state creates draft without fixtures')
} finally { try { run('close') } catch { /* preserve first failure */ } }
