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
// agent-browser fill leaves these React-controlled inputs empty (seen on production /my too, 2026-10-19),
// so set the value through the native setter and fire the input event React listens to.
const setValue = (selector, value) => evalPage(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
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
  await wait("document.querySelector('.checklist-banner').compareDocumentPosition(document.querySelector('.my-timetable-summary')) & Node.DOCUMENT_POSITION_FOLLOWING", 'checklist precedes the timetable summary')
  await wait("!document.querySelector('.my-schedule') && document.querySelector('.my-timetable-summary .timetable-cta')?.getAttribute('href') === '/timetable'", 'MY links to the timetable page instead of embedding the editor')
  evalPage("document.querySelector('.my-timetable-summary .timetable-cta').click(); true")
  await wait("location.pathname === '/timetable' && new URLSearchParams(location.search).get('school') === 'qa-school-a' && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/learn'", 'timetable opens the first saved school under the 학습 준비 tab')
  await wait("[...document.querySelectorAll('.my-schedule button')].some(button => button.textContent === '자료 없이 직접 만들기')", 'draft controls finish loading')
  click('자료 없이 직접 만들기')
  await wait("document.querySelector('.my-week-section')", 'manual draft without invented school hours')
  click('주간 편집')
  evalPage("document.querySelector('.my-calendar-add').click(); true")
  click('직접 입력')
  setValue('.my-calendar-form input:not([type])', '미술 후보')
  setValue('.my-calendar-form input[type=time]', '14:00')
  setValue('.my-calendar-form label:last-child input[type=time]', '15:00')
  click('저장')
  await wait("document.querySelector('.my-week').textContent.includes('미술 후보')", 'new course is considering, not confirmed')
  click('내 시간표로 사용')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-a'", 'select primary draft')
  evalPage("document.querySelector('.timetable-picks button[data-school-id=\"qa-school-b\"]').click(); true")
  await wait("new URLSearchParams(location.search).get('school') === 'qa-school-b'", 'school chip switches the draft in place')
  await wait("[...document.querySelectorAll('.my-schedule button')].some(button => button.textContent === '자료 없이 직접 만들기')", 'draft controls finish loading')
  click('자료 없이 직접 만들기')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.length === 2", 'second candidate has independent draft')
  click('내 시간표로 사용')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-b'", 'switch primary without deleting first draft')
  evalPage("location.reload(); true")
  await wait("document.querySelector('.my-active-plan')?.textContent.includes('QA 후보 B')", 'reload restores active plan')
  click('주간 편집')
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.find(p=>p.schoolId==='qa-school-a').entries[0].participation==='considering'", 'selection never confirms course participation')
  await wait("document.documentElement.scrollWidth <= innerWidth", 'mobile timetable layout has no horizontal overflow')
  await wait("document.querySelector('.my-week__timeline').getBoundingClientRect().height === 504 && document.querySelector('.my-week').scrollWidth > document.querySelector('.my-week').clientWidth", 'empty weekdays retain the shared 12–19 time grid and horizontal scroll')
  run('open', new URL('/my', base).href)
  await wait("document.querySelectorAll('.my-timetable-summary__list li').length === 2 && document.querySelector('.my-timetable-summary__list li:first-child').textContent.includes('QA 후보 B') && document.querySelector('.my-timetable-summary__list li:first-child .my-plan-badge')", 'MY summary lists both drafts with the active one first')
  evalPage("[...document.querySelectorAll('[aria-label=\"관심 후보 유형\"] button')].find(b=>b.textContent.startsWith('아파트')).click(); true")
  await wait("document.querySelectorAll('.my-saved li').length === 1 && document.querySelector('.my-saved').textContent.includes('QA 아파트')", 'apartment tab remains independent')
  await wait("document.documentElement.scrollWidth <= innerWidth", 'mobile MY layout has no horizontal overflow')
  await wait("getComputedStyle(document.querySelector('.my-saved li')).display === 'block'", 'candidate actions stack below the card heading')
  evalPage("[...document.querySelectorAll('[aria-label=\"관심 후보 유형\"] button')].find(b=>b.textContent.startsWith('학교')).click(); true")
  evalPage("document.querySelector('[aria-label=\"QA 후보 B 저장 삭제\"]').click(); true")
  run('open', new URL('/timetable?school=qa-school-b', base).href)
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).activeSchoolId === 'qa-school-b' && document.querySelector('.my-schedule')?.textContent.includes('관심 학교에 저장하지 않은 학교')", 'favorite removal preserves active draft with explanation')
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
  // Without saving: search a school by name on the timetable page.
  evalPage("localStorage.removeItem('elementary-favorites-v1'); true")
  run('open', new URL('/timetable', base).href)
  await wait("document.querySelector('.timetable-search input') && !document.querySelector('.my-schedule')", 'timetable starts with the school search when nothing is saved')
  setValue('.timetable-search input', '서울대현')
  await wait("[...document.querySelectorAll('.timetable-search__results button')].some(b=>b.textContent.includes('대현초'))", 'school search returns the real school')
  evalPage("[...document.querySelectorAll('.timetable-search__results button')].find(b=>b.textContent.includes('대현초')).click(); true")
  await wait("new URLSearchParams(location.search).get('school') === 'B000002292' && document.querySelector('[data-testid=school-day-estimate]') && document.querySelector('.my-schedule')", 'picked school shows its school day and the draft controls')
  click('시간표 초안 만들기')
  await wait("document.querySelector('.my-week-section')", 'real source import or explicit missing-data state creates draft without fixtures')
} finally { try { run('close') } catch { /* preserve first failure */ } }
