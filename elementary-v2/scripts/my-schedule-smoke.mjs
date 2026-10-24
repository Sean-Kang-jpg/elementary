import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local preview URL explicitly; fixtures are local only.')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-schedule', '--session', `schedule-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`(() => { try { return Boolean(${condition}) } catch { return false } })()`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const clickText = text => evaluate(`[...document.querySelectorAll('.my-schedule button')].find(b=>b.textContent===${JSON.stringify(text)}).click(); true`)
const choose = name => evaluate(`[...document.querySelectorAll('.my-course-choice')].find(b=>b.getAttribute('data-program-label')?.startsWith(${JSON.stringify(name)})).click(); true`)
const openChoices = () => evaluate("document.querySelector('.my-program-selection').open=true; true")
const plan = "JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.find(p=>p.schoolId==='qa-schedule')"
try {
  // Open first: with a viewport set beforehand, --init-script opens on a blank tab (agent-browser, 2026-10-19).
  run('open', new URL('/timetable', base).href, '--init-script', path.join(root, 'scripts/fixtures/my-schedule-network.js'))
  run('set', 'viewport', '390', '844')
  await wait("document.querySelector('#timetable-title')", 'timetable page opens')
  evaluate(`localStorage.removeItem('elementary-schedule-plans-v1'); localStorage.setItem('elementary-favorites-v1',JSON.stringify([{kind:'school',id:'qa-schedule',name:'QA 시간표 검사용 학교',address:'운영자료 아님',latitude:0,longitude:0}])); location.reload(); true`)
  await wait("new URLSearchParams(location.search).get('school')==='qa-schedule' && document.querySelector('.timetable-picks button[aria-pressed=true]')?.dataset.schoolId==='qa-schedule' && document.querySelector('.my-schedule')", 'saved QA school opens without a separate save step')
  clickText('시간표 초안 만들기')
  await wait("document.querySelectorAll('.my-course-choice').length===7", 'care and per-section course choices load')
  clickText('주간 편집')
  check("document.querySelector('.my-program-selection > summary').textContent==='방과후/맞춤형/돌봄 선택하기' && document.querySelector('.my-entry-form > summary').textContent==='추가 일정 입력하기' && document.querySelector('.my-week-section').compareDocumentPosition(document.querySelector('.my-program-selection')) & Node.DOCUMENT_POSITION_FOLLOWING", 'renamed selection and input menus follow the calendar')
  openChoices()
  check("[...document.querySelectorAll('.my-calendar__hours span')].map(e=>e.textContent).join(',')==='12:00,13:00,14:00,15:00,16:00,17:00,18:00,19:00'", 'fixed time axis runs from noon to 7pm')
  check(`${plan}.entries.length===5 && ${plan}.entries.every(e=>e.kind==='school')`, 'new draft imports dismissal only and waits for explicit care selection')
  check("[...document.querySelectorAll('.my-course-choice')].find(b=>b.getAttribute('data-program-label')?.startsWith('QA 미술 · B')).parentElement.textContent.includes('1학년 대상 확인 필요')", 'grade eligibility is shown beside each section')
  check("[...document.querySelectorAll('.my-course-choice__lines')].every(e=>e.children.length===2 && e.children[0].tagName==='B' && e.children[1].tagName==='SPAN')", 'program selection buttons have only a heading row and a time row')
  choose('QA 미술 · A')
  await wait(`${plan}.entries.some(e=>e.label==='QA 미술 · A' && e.start===840 && e.end===900 && e.participation==='planned' && e.weekdays.join(',')==='1,3')`, 'selection auto-fills all source weekdays and times without confirming participation')
  check("[1,3].every(d=>document.querySelector('#my-week-day-'+d).textContent.includes('QA 미술')) && !document.querySelector('#my-week-day-2').textContent.includes('QA 미술')", 'course appears on exactly its source weekdays')
  check("(() => { const grid=document.querySelector('#my-week-day-1 .my-week__timeline').getBoundingClientRect();const event=document.querySelector('#my-week-day-1 .my-week__entry[data-start=\"840\"]').getBoundingClientRect();return Math.abs(event.top-grid.top-144)<1 && Math.abs(event.height-72)<1 })()", '14–15 course occupies precisely one hour on the time axis')
  choose('맞춤형 QA 놀이')
  await wait("document.querySelector('#my-week-day-1').textContent.includes('시간 겹침 1건')", 'selected overlapping courses show conflict immediately')
  evaluate("document.querySelector('.my-course-choice--care').click(); true")
  await wait("document.querySelector('#my-week-day-1 .my-care-connection')?.textContent.includes('돌봄 + 방과후/맞춤형 함께 계획')", 'care and classes are presented as a combined plan')
  check(`${plan}.entries.filter(e=>e.kind!=='school').length===3 && ${plan}.entries.filter(e=>e.kind!=='school').every(e=>e.participation==='planned')`, 'care can be selected alongside both afterschool and customized classes')
  check("document.querySelector('#my-week-day-1 .my-care-connection').textContent.includes('15:30–17:00') && !document.querySelector('#my-week-day-1 .my-care-connection').classList.contains('my-warning')", 'remaining care after class is an informational connection rather than a conflict')
  check("[...document.querySelectorAll('#my-week-day-1 .my-week__entry[data-lanes=\"3\"]')].length===3", 'overlapping care and classes get separate calendar lanes')
  check(`${plan}.entries.find(e=>e.kind==='care').startsAfterSchool && document.querySelector('#my-week-day-1 .my-week__entry--care').getAttribute('aria-label').includes('13:00 (하교 후) ~ 17:00')`, 'care resolves its start from that weekday dismissal')
  check("[...document.querySelectorAll('.my-week__entry')].every(b=>b.children.length===2 && b.children[0].tagName==='B' && b.children[1].tagName==='SPAN' && getComputedStyle(b.children[0]).whiteSpace==='nowrap' && getComputedStyle(b.children[1]).whiteSpace==='nowrap')", 'calendar buttons contain exactly two non-wrapping text rows')
  check("document.querySelector('#my-week-day-1 .my-week__entry--school .my-entry-title').textContent==='정규수업 · 4교시' && document.querySelector('#my-week-day-1 .my-week__entry--care .my-entry-title').textContent==='돌봄 · 오후' && document.querySelector('#my-week-day-1 .my-week__entry--custom .my-entry-title').textContent==='맞춤형 · QA 놀이'", 'type and program names are shown once without duplicated labels')
  check("[...document.querySelectorAll('.my-week__entry b')].every(b=>b.querySelector('.my-entry-icon[aria-hidden=true] svg') && !b.querySelector('.my-entry-icon').textContent && getComputedStyle(b).display==='flex')", 'simple SVG subject icons replace emoji without adding a third text row')
  check("[...document.querySelectorAll('.my-week__entry')].every(b=>getComputedStyle(b).borderLeftWidth==='0px' && getComputedStyle(b).borderRightWidth==='0px')", 'pastel cards have no colored side rail or decorative border')
  evaluate("document.querySelector('.my-course-choice--care').click(); true")
  await wait(`${plan}.entries.filter(e=>e.kind==='afterschool').length===2 && !${plan}.entries.some(e=>e.kind==='care')`, 'deselecting care preserves both selected courses')
  evaluate("document.querySelector('.my-course-choice--care').click(); true")
  run('reload')
  await wait("document.querySelectorAll('.my-course-choice[aria-pressed=true]').length===3", 'reload restores selected courses and care')
  clickText('주간 편집') // reload returns to the day view; the weekday grid checks below need the editor
  openChoices()
  choose('QA 미술 · A')
  await wait(`!${plan}.entries.some(e=>e.label==='QA 미술 · A') && ${plan}.entries.some(e=>e.kind==='care') && !document.querySelector('#my-week-day-1').textContent.includes('시간 겹침')`, 'deselecting a class preserves care and updates course conflicts')
  run('fill', '.my-course-picker input', '시간미확인')
  await wait("document.querySelectorAll('.my-course-choice').length===1", 'search narrows the course list')
  choose('QA 시간미확인')
  await wait(`${plan}.entries.some(e=>e.label==='QA 시간미확인' && e.start===null && e.end===null) && document.querySelector('#my-week-day-4').textContent.includes('시간 확인 필요')`, 'missing times stay unknown without invented clock times')
  check("document.querySelector('#my-week-day-4 .my-week__unplaced').textContent.includes('QA 시간미확인') && ![...document.querySelectorAll('#my-week-day-4 .my-week__entry')].some(e=>e.textContent.includes('QA 시간미확인'))", 'unknown times stay outside the calendar grid')
  evaluate("(() => {const qaStore=JSON.parse(localStorage.getItem('elementary-schedule-plans-v1'));qaStore.plans.find(p=>p.schoolId==='qa-schedule').entries.find(e=>e.label==='QA 시간미확인').weekdays=[1,4];localStorage.setItem('elementary-schedule-plans-v1',JSON.stringify(qaStore));window.dispatchEvent(new Event('storage'));return true})()")
  await wait("document.querySelector('#my-week-day-1 .my-care-connection') && !document.querySelector('#my-week-day-1 .my-care-connection').textContent.includes('종료 →')", 'unknown class times do not produce an assumed care resumption time')
  evaluate("(() => {const qaStore=JSON.parse(localStorage.getItem('elementary-schedule-plans-v1'));qaStore.plans.find(p=>p.schoolId==='qa-schedule').entries.find(e=>e.label==='QA 시간미확인').weekdays=[4];localStorage.setItem('elementary-schedule-plans-v1',JSON.stringify(qaStore));window.dispatchEvent(new Event('storage'));return true})()")
  run('fill', '.my-course-picker input', '요일미확인')
  choose('QA 요일미확인')
  await wait("document.querySelector('.my-entry-form').open && [...document.querySelectorAll('.my-entry-form input[type=checkbox]')].every(e=>!e.checked)", 'missing weekday opens prefilled form with no assumed weekday')
  run('check', '.my-entry-form input[type=checkbox]:first-child')
  clickText('시간표에 넣기')
  await wait(`${plan}.entries.filter(e=>e.label==='QA 요일미확인').length===1 && document.querySelector('.my-course-choice').getAttribute('aria-pressed')==='true'`, 'manual weekday completion keeps a stable section identity')
  run('focus', '.my-course-picker input')
  run('press', 'Control+a')
  run('press', 'Backspace')
  await wait("document.querySelectorAll('.my-course-choice').length===7", 'clearing search restores all choices')
  for (const width of [360,390,430,768,1280]) {
    run('set', 'viewport', String(width), '900')
    check("document.documentElement.scrollWidth<=innerWidth", `${width}px page contains its own horizontal scroll`)
    check("[...document.querySelectorAll('.my-course-choice')].every(b=>b.getBoundingClientRect().height>=44)", `${width}px choices keep touch target height`)
    check(width < 900 ? "document.querySelector('.my-week').scrollWidth>document.querySelector('.my-week').clientWidth" : "document.querySelector('.my-week').scrollWidth===document.querySelector('.my-week').clientWidth", `${width}px uses appropriate weekday layout`)
  }
  run('set', 'viewport', '390', '844')
  run('click', '.my-week-nav button:last-child')
  await wait("document.querySelector('.my-week-nav button:last-child').getAttribute('aria-pressed')==='true' && document.querySelector('.my-week').scrollLeft>0", 'Friday button moves horizontally without a page jump')
  check("document.querySelector('.my-calendar__axis').getBoundingClientRect().left < document.querySelector('.my-week').getBoundingClientRect().left", 'time axis remains on the left while weekdays scroll')
  run('focus', '.my-week-nav button:first-child')
  run('press', 'Enter')
  await wait("document.querySelector('.my-week').scrollLeft<2", 'keyboard weekday navigation returns to Monday')
  run('click', '#my-week-day-1 .my-week__entry[data-start="870"]')
  await wait("document.querySelector('.my-week-detail')?.textContent.includes('맞춤형 QA 놀이')", 'short or overlapping event opens readable details')
  evaluate("document.querySelector('.my-week-detail button[aria-label=\"닫기\"]').click(); true")
  if (process.argv[3]) {
    run('scrollintoview', '.my-week-section')
    run('screenshot', process.argv[3])
    run('scrollintoview', '.my-course-picker')
    run('screenshot', process.argv[3].replace('.png', '-choices.png'))
  }
  evaluate("window.qaSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='elementary-schedule-plans-v1')throw Error('QA quota');return window.qaSetItem.call(this,key,value)}; true")
  choose('QA 미술 · A')
  await wait(`!${plan}.entries.some(e=>e.label==='QA 미술 · A') && document.querySelector('.my-schedule [role=status]').textContent.includes('저장되지 않았어요')`, 'failed storage keeps selection and saved plan unchanged')
  evaluate("Storage.prototype.setItem=window.qaSetItem; sessionStorage.setItem('qa-schedule-fail','true'); location.reload(); true")
  await wait("document.querySelector('.my-course-picker [role=alert]')?.textContent.includes('강좌') && document.querySelectorAll('.my-course-choice--care').length===2", 'course failure preserves separately loaded care choices')
  evaluate("sessionStorage.removeItem('qa-schedule-fail'); window.qaScheduleFail=false; true")
  clickText('자료 다시 불러오기')
  await wait("document.querySelectorAll('.my-course-choice').length===7 && !document.querySelector('.my-course-picker [role=alert]')", 'retry restores course data without changing the saved plan')
  // Real public reads are verified separately from the QA fixtures.
  evaluate("localStorage.setItem('elementary-favorites-v1',JSON.stringify([{kind:'school',id:'B000002292',name:'서울대현초등학교',address:'서울',latitude:0,longitude:0}])); localStorage.removeItem('elementary-schedule-plans-v1'); location.href='/timetable'; true")
  await wait("new URLSearchParams(location.search).get('school')==='B000002292' && document.querySelector('[data-testid=school-day-estimate]')", 'real Seoul school is selected and its school-day data is shown before a draft')
  clickText('시간표 초안 만들기')
  await wait("document.querySelector('.my-course-picker[aria-busy=false]')", 'real Seoul program and care reads finish')
  openChoices()
  const realCourses = evaluate("window.qaScheduleReads.some(r=>r.table==='school_afterschool_programs' && r.status===200 && Array.isArray(r.data) && r.data.length>0)").includes('true')
  if (realCourses) {
    evaluate("document.querySelector('.my-course-choice[data-program-label][aria-label*=\"시간표에 넣기\"]').click(); true")
    await wait("document.querySelector('.my-course-choice[aria-pressed=true]')", 'real Seoul course selection fills the timetable')
    check("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.some(e=>e.kind==='afterschool' && e.participation==='planned' && e.source.ref==='school_afterschool:B000002292')", 'real selection retains DB provenance')
  } else {
    check("window.qaScheduleReads.some(r=>r.table==='school_afterschool_programs' && r.status===404 && r.data.code==='PGRST205') && document.querySelector('.my-course-picker').textContent.includes('강좌 자료는 아직 확인하지 못했어요')", 'missing live course table is reported without using development fixtures')
    process.stdout.write('SKIP: real course auto-fill — current Supabase project has no school_afterschool tables; QA section auto-fill passed above.\n')
  }
  check("window.qaScheduleReads.some(r=>r.table==='school_care_hours' && r.status===200 && (Array.isArray(r.data) ? r.data.some(row=>row.school_id==='B000002292') : r.data.school_id==='B000002292'))", 'real Seoul care data is read from the DB')
  evaluate("document.querySelector('.my-course-choice--care').click(); true")
  await wait("JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.some(e=>e.kind==='care' && e.participation==='planned' && e.source.ref==='school_care_hours:B000002292')", 'real Seoul care selection auto-fills and retains source provenance')
  if (process.argv[3]) {
    run('scrollintoview', '.my-week-section')
    run('screenshot', process.argv[3].replace('.png', '-real.png'))
    run('set', 'viewport', '1280', '900')
    run('scrollintoview', '.my-week-section')
    run('screenshot', process.argv[3].replace('.png', '-desktop.png'))
  }
} finally { try { run('close') } catch { /* preserve the first failure */ } }
