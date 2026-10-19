// Local isolated browser QA: never writes to the app's school data or the user's browser profile.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local preview URL explicitly.')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-calendar', '--session', `calendar-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const json = code => {
  let value = evaluate(code)
  while (typeof value === 'string') { try { value = JSON.parse(value) } catch { break } }
  return value
}
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const entries = "JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries"
const timeline = day => `#my-week-day-${day} .my-week__timeline`
const point = (day, minute, fraction = .5) => json(`(() => { const r=document.querySelector('${timeline(day)}').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fraction}),y:Math.round(r.top+(${minute}-720)/420*r.height)} })()`)
const mouse = (p) => run('mouse', 'move', String(p.x), String(p.y))
const drag = (from, to) => {
  mouse(from); run('mouse', 'down')
  mouse({ x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) })
  mouse(to); run('mouse', 'up')
}
const clickPoint = p => { mouse(p); run('mouse', 'down'); run('mouse', 'up') }
const times = (start, end) => `document.querySelector('.my-calendar-form input[type=time]').value==='${start}' && document.querySelectorAll('.my-calendar-form input[type=time]')[1].value==='${end}'`
// agent-browser's time-input fill does not dispatch React's native input events on Windows.
const fillTime = (index, value) => evaluate(`(() => { const input=document.querySelectorAll('.my-calendar-form input[type=time]')[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true })()`)
const submit = () => {
  // The Windows CLI's nearest-edge scroll can put an inline button behind the fixed GNB.
  evaluate("document.querySelector('.my-calendar-form button[type=submit]').scrollIntoView({block:'center'}); true")
  run('click', '.my-calendar-form button[type=submit]')
}
const save = label => { run('fill', '.my-calendar-form input:not([type])', label); submit() }
const chooseManual = () => run('click', '.my-add-card__tabs button:last-child')
try {
  run('set', 'viewport', '1280', '1000')
  run('open', new URL('/timetable', base).href)
  await wait("document.querySelector('#timetable-title')", 'timetable page opens')
  evaluate(`(() => {
    const item=(id,label,weekdays,start,end,extra={})=>({id,label,weekdays,start,end,kind:'personal',evidence:'estimated',participation:'planned',term:'semester',...extra});
    localStorage.setItem('elementary-favorites-v1',JSON.stringify([{kind:'school',id:'qa-schedule',name:'시간표 조작 검사용 학교',address:'운영자료 아님',latitude:0,longitude:0}]));
    localStorage.setItem('elementary-schedule-plans-v1',JSON.stringify({version:1,activeSchoolId:null,plans:[{schoolId:'qa-schedule',schoolName:'시간표 조작 검사용 학교',entryYear:null,updatedAt:'2026-10-15',entries:[
      item('school','정규수업 4교시',[1,2,3,4,5],540,780,{kind:'school',participation:'confirmed',source:{ref:'qa-school',version:'2026'}}),
      item('course','방과후 미술',[2],840,900,{kind:'afterschool',source:{ref:'qa-course',version:'2026'}}),
      item('care','오후 돌봄',[5],780,1020,{kind:'care',source:{ref:'qa-care',version:'2026'}}),
      item('custom','맞춤형 놀이',[4],780,840,{kind:'afterschool',source:{ref:'qa-custom',version:'2026'}}),
      item('repeat','피아노',[1,3],840,900,{participation:'applying'}),item('single','축구',[4],960,1020)
    ]}]})); location.reload();return true;
  })()`)
  await wait("document.querySelector('.my-calendar-view')", 'isolated day view renders')
  run('click', '.my-calendar-view button:last-child')
  await wait("document.querySelector('#my-week-day-1 .my-week__entry--editable')", 'isolated calendar fixture renders')
  run('scrollintoview', '.my-week-section')
  clickPoint(point(1, 968))
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'clicking a blank calendar cell opens inline choices and manual editor')
  check(times('16:10', '17:10'), 'click snaps to 5 minutes with a one-hour default')
  save('도서관')
  await wait(`${entries}.some(e=>e.label==='도서관' && e.start===970 && e.end===1030 && e.participation==='considering')`, 'new event persists as a candidate, not confirmed')
  run('scrollintoview', '.my-week-section')
  drag(point(2, 930), point(2, 975))
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'dragging blank space opens a range editor')
  check(times('15:30', '16:15'), 'dragged range respects 5-minute endpoints')
  run('press', 'Escape')
  check(`!${entries}.some(e=>e.start===930)`, 'Escape cancels without saving')
  drag(point(3, 1030), point(3, 985))
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'reverse drag opens the editor')
  check(times('16:25', '17:10'), 'reverse selection normalizes its endpoints')
  save('코딩')
  await wait(`${entries}.some(e=>e.label==='코딩' && e.start===985 && e.end===1030)`, 'reverse selection saves the exact range')
  run('scrollintoview', '.my-week-section')
  drag(point(1, 860), point(2, 875))
  await wait(`${entries}.some(e=>e.label==='피아노' && e.weekdays.join(',')==='2' && e.start===855 && e.end===915 && e.participation==='applying')`, 'drag moves the grabbed weekday to Tuesday, preserving duration and participation')
  check(`${entries}.find(e=>e.id==='repeat').weekdays.join(',')==='3' && ${entries}.find(e=>e.id==='repeat').start===840`, 'other weekdays in the recurring entry remain unchanged')
  run('scrollintoview', '.my-week-section')
  drag(point(4, 975), point(4, 1010))
  await wait(`${entries}.find(e=>e.id==='single').start===995 && ${entries}.find(e=>e.id==='single').end===1055`, 'single-day drag keeps the same entry id and duration')
  const before = evaluate(entries)
  drag(point(5, 820), point(4, 850))
  check(`${entries}.find(e=>e.id==='care').weekdays[0]===5 && ${entries}.find(e=>e.id==='care').start===780 && !document.querySelector('.my-add-card')`, 'source care cannot be moved or converted to a user-created entry')
  drag(point(3, 850), { x: 10, y: 100 })
  check(`${entries}.find(e=>e.id==='repeat').start===840 && !document.querySelector('.my-calendar-draft')`, 'dropping outside the calendar cancels the drag')
  check(evaluate(entries) === before ? 'true' : 'false', 'cancelled and protected drags leave storage unchanged')
  run('focus', timeline(5)); run('press', 'ArrowDown'); run('press', 'Enter')
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'keyboard Enter opens the schedule editor')
  check(times('14:05', '15:05'), 'keyboard arrows advance by exactly five minutes')
  run('press', 'Escape')
  run('reload')
  await wait("document.querySelector('.my-calendar-view')", 'day view renders after reload')
  run('click', '.my-calendar-view button:last-child')
  await wait(`${entries}.some(e=>e.label==='피아노' && e.weekdays[0]===2 && e.start===855) && document.querySelector('.my-week__entry--editable')`, 'reload restores moved entries')
  run('set', 'viewport', '390', '844')
  run('scrollintoview', '.my-week-section')
  run('click', '.my-week-nav button:first-child')
  clickPoint(point(1, 900))
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'mobile-width blank tap opens an editor')
  check("document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll('.my-calendar-form input[type=time]')[0].step==='300'", 'mobile editor fits the screen and uses five-minute time inputs')
  run('select', '.my-calendar-form .my-time-fields label:first-child select', 'afterschool')
  run('select', '.my-calendar-form .my-time-fields label:last-child select', '4')
  fillTime(0, '15:05')
  fillTime(1, '14:00')
  check(times('15:05', '14:00'), 'mobile inputs retain the requested values before validation')
  save('독서')
  check("document.querySelector('.my-calendar-form [role=alert]').textContent.length>0", 'reversed times are rejected without closing the editor')
  fillTime(1, '15:40')
  submit()
  await wait(`${entries}.some(e=>e.label==='독서' && e.weekdays[0]===4 && e.start===905 && e.end===940)`, 'mobile form can change the day and save an exact five-minute range')
  run('click', '.my-week-nav button:first-child')
  clickPoint(point(1, 900))
  chooseManual()
  await wait("document.querySelector('.my-calendar-form')", 'editor can be opened again')
  evaluate("window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='elementary-schedule-plans-v1')throw Error('QA quota');return window.qaSetItem.call(this,k,v)};true")
  save('저장실패')
  check(`!${entries}.some(e=>e.label==='저장실패') && document.querySelector('.my-calendar-form [role=alert]').textContent.includes('저장하지 못했어요')`, 'storage failure keeps the editor open without a phantom event')
  evaluate("Storage.prototype.setItem=window.qaSetItem;true")
  run('press', 'Escape')
  check("[...document.querySelectorAll('.my-week__entry')].every(b=>b.children.length===2 && b.querySelector('.my-entry-icon[aria-hidden=true] svg') && getComputedStyle(b).borderLeftWidth==='0px')", 'borderless pastel cards contain simple SVG icons and exactly two rows')
  run('click', '.my-calendar-add')
  run('press', 'Escape')
  if (process.argv[3]) {
    run('set', 'viewport', '1280', '1000')
    run('scrollintoview', '.my-week-section')
    run('screenshot', process.argv[3])
    run('set', 'viewport', '390', '844')
    run('click', '.my-week-nav button:first-child')
    run('scrollintoview', '.my-week-section')
    run('screenshot', process.argv[3].replace('.png', '-mobile.png'))
    clickPoint(point(1, 900))
    run('screenshot', process.argv[3].replace('.png', '-dialog.png'))
  }
} finally { try { run('close') } catch { /* preserve first error */ } }
