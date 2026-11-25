import path from 'node:path'

export async function smokeTimetableInput({ baseUrl, projectRoot, run, waitFor, assertPage }) {
  const base = new URL(baseUrl)
  if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['3000', '3001'].includes(base.port)) {
    throw new Error('TT-01 fixture must run on localhost:3000 or localhost:3001')
  }
  const fixture = path.join(projectRoot, 'scripts/fixtures/tt01-network.js')
  const evaluate = (code) => run(['eval', code], { quiet: true })
  const click = (label, scope = 'body') => evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(scope + ' button')})]
      .find(node => node.textContent.trim().startsWith(${JSON.stringify(label)}) && !node.disabled)
    if (!button) throw new Error(${JSON.stringify('Missing button: ' + label)})
    button.click()
    return true
  })()`)
  const step = (name) => `document.querySelector('[data-testid=plan-starter]')?.dataset.step === '${name}'`
  const buttonReady = (label) => `[...document.querySelectorAll('.plan-starter button')].some(b => !b.disabled && b.textContent.startsWith(${JSON.stringify(label)}))`
  const answer = (label) => click(label, '.plan-starter')
  const log = '(window.__ANALYTICS_LOG__ || [])'
  const events = (name) => `${log}.filter(e => e.event === '${name}')`
  const completed = events('timetable_complete')
  const steps = events('timetable_step')
  const key = 'elementary-schedule-plans-v1'
  const plans = `JSON.parse(localStorage.getItem('${key}') || '{"plans":[]}').plans`
  const plan = (id) => `${plans}.find(p => p.schoolId === '${id}')`
  const done = "document.querySelector('[data-testid=starter-complete]')"
  const open = (target) => {
    run(['open', new URL(target, base).href, '--init-script', fixture], { quiet: true })
    run(['set', 'viewport', '390', '844'], { quiet: true })
  }
  const route = (target) => evaluate(`history.pushState({}, '', ${JSON.stringify(target)}); dispatchEvent(new PopStateEvent('popstate')); true`)
  const school = (number) => `/timetable?school=B90000000${number}`
  const formValue = (selector, value) => evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
  const blockWrites = (blocked) => evaluate(blocked
    ? `window.qaSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === '${key}') throw new Error('Fixture storage quota'); return window.qaSetItem.call(this,k,v) }; true`
    : 'Storage.prototype.setItem = window.qaSetItem; true')
  const overflow = 'document.documentElement.scrollWidth === innerWidth && innerWidth === 390'

  open('/timetable?face=week')
  await waitFor("document.querySelector('.timetable-pick')", 'TT-01 school search is optional')
  click('학교 없이 시작')
  click('+ 일정 추가')
  click('저장', '.my-calendar-form')
  await waitFor(`${plan('no-school')}?.entries[0]?.label === '픽업' && ${events('timetable_draft_create')}.length === 1`, 'TT-01 first pickup creates the standalone draft exactly once')
  assertPage(`${overflow} && !${events('timetable_draft_create')}[0].params.school_id`, 'TT-01 standalone 390px viewport and anonymized draft event')
  open('/timetable?face=week')
  await waitFor("document.querySelector('.my-agenda__card--personal')", 'TT-01 restores pickup from a full reload')
  evaluate("document.querySelector('.my-agenda__card--personal').click(); true")
  await waitFor("document.querySelector('dialog[open]')", 'TT-01 restored pickup can be edited')
  // The agenda sheet saves occurrence times. Change start and end together.
  const sheet = 'dialog[open]'
  await waitFor(`document.querySelector('${sheet} input[type=time]')`, 'TT-01 editable pickup time fields')
  formValue(`${sheet} input[type=time]`, '14:10')
  click('저장', sheet)
  await waitFor(`${plan('no-school')}?.entries[0]?.userOverride?.start === 850`, 'TT-01 edited pickup time persists')
  evaluate(`window.qaManualSnapshot = ${plan('no-school')}.entries[0]; true`)

  evaluate(`localStorage.setItem('elementary-favorites-v1', JSON.stringify([{kind:'school',id:'B900000001',name:'QA School',address:'QA',latitude:0,longitude:0}])); dispatchEvent(new Event('storage')); true`)
  await waitFor("document.querySelector('[data-school-id=B900000001]')", 'TT-01 school selection remains available after a manual edit')
  evaluate("document.querySelector('[data-school-id=B900000001]').click(); true")
  await waitFor(buttonReady('17시쯤'), 'TT-01 first question appears for a school with no data')
  await waitFor(`${steps}.filter(e => e.params.step === 'return' && e.params.answer === 'start').length === 1`, 'TT-01 first question start counted once')
  answer('17시쯤')
  await waitFor(step('dismissal'), 'TT-01 missing dismissal appears after return')
  answer('요일마다 달라요')
  click('12:50', '[aria-label="월요일 하교"]')
  click('14:30', '[aria-label="화요일 하교"]')
  answer('하교 시각 저장')
  await waitFor(step('care'), 'TT-01 weekday dismissal stores then advances')
  assertPage(`${plan('B900000001')}.entries.some(e => e.end === 770) && ${plan('B900000001')}.entries.some(e => e.timeAssumption && e.end === 820) && ${plan('B900000001')}.entries.some(e => JSON.stringify(e) === JSON.stringify(window.qaManualSnapshot))`, 'TT-01 school setup retains the exact edited manual entry and tags the dismissal assumption')
  assertPage("!document.querySelector('.my-calendar-add, .my-entry-list, .my-schedule-notes')", 'TT-01 questions keep preview and hide the editor and draft management')
  answer('예, 신청')
  await waitFor("document.querySelector('#plan-starter-title')?.textContent === '이 학교 강좌 시간은 아직 없어요'", 'TT-01 a confirmed absence has its own courses screen')
  answer('다음')
  await waitFor(step('fill'), 'TT-01 skip advances to completion')
  blockWrites(true)
  answer('다 됐어요')
  assertPage(`${completed}.length === 0 && ${events('timetable_save_failure')}.length === 1 && ${plan('B900000001')}.starter.done === false`, 'TT-01 failed completion records failure but emits no completion')
  blockWrites(false)
  answer('다 됐어요')
  await waitFor(`${done} && ${completed}.length === 1`, 'TT-01 successful retry shows completion and emits once')
  assertPage(`${overflow} && ${completed}[0].params.has_slots === 0 && ${completed}[0].params.has_dismissal === 0 && ${completed}[0].params.coverage_state === 'covered' && ${steps}.some(e => e.params.step === 'courses' && e.params.answer === 'skip') && !${plan('B900000001')}.entries.some(e => e.kind === 'afterschool')`, 'TT-01 completion marks no source data and never creates a course automatically')
  open(school(1))
  await waitFor(`${done} && ${completed}.length === 0`, 'TT-01 full reload restores completion without emitting again')

  route(school(2))
  await waitFor(`${buttonReady('정규수업 끝나면 바로')} && window.qaReleaseCourses`, 'TT-01 dismissal data is usable while course data is delayed')
  answer('정규수업 끝나면 바로')
  await waitFor(`${done} && ${completed}.length === 1`, 'TT-01 immediate pickup completes without waiting for course data')
  assertPage(`${completed}[0].params.coverage_state === 'covered' && ${completed}[0].params.has_dismissal === 1 && !Object.hasOwn(${completed}[0].params,'has_slots')`, 'TT-01 late slot flag is omitted from the immediate completion')
  evaluate('window.qaReleaseCourses(); true')
  await waitFor('window.qaCoursesDelivered && document.querySelector("[data-testid=starter-complete]")', 'TT-01 immediate completion stays visible')
  assertPage(`${completed}.length === 1`, 'TT-01 late data does not replay completion')

  route(school(3))
  await waitFor(`${buttonReady('17시쯤')} && document.querySelector('.plan-starter').textContent.includes('하교 시각을 직접 고를 수 있어요')`, 'TT-01 failed dismissal lookup allows a manual answer')
  answer('17시쯤')
  await waitFor(step('dismissal'), 'TT-01 failed-course fixture still allows entering dismissal')
  answer('잘 몰라요')
  answer('아니요')
  await waitFor("document.querySelector('#plan-starter-title')?.textContent.includes('불러오지 못했어요')", 'TT-01 course fetch failure differs from confirmed absence')
  answer('건너뛰기')
  answer('다 됐어요')
  await waitFor(`${done} && ${completed}.length === 2 && !Object.hasOwn(${completed}.at(-1).params,'has_slots')`, 'TT-01 failed lookup still completes and omits the flag')

  route(school(4))
  await waitFor(buttonReady('17시쯤'), 'TT-01 partially reported dismissal is usable')
  answer('17시쯤')
  await waitFor(step('care'), 'TT-01 one public dismissal day skips the extra question')
  answer('아니요')
  await waitFor(buttonReady('예, 고를게요'), 'TT-01 actual course data offers selection')
  answer('예, 고를게요')
  await waitFor("document.querySelector('[data-program-label]')", 'TT-01 actual school courses render in the guided picker')
  assertPage(`${overflow} && !document.querySelector('.plan-starter .my-course-filters, .plan-starter input[type=search], .plan-starter .my-course-choice--care') && [...document.querySelectorAll('.plan-starter .my-course-picker p')].map(e => e.textContent).join('').replace(/\s/g, '').length <= 120`, 'TT-01 guided picker keeps fixed copy short and omits filters, search and duplicate care')
  evaluate("document.querySelector('[data-program-label]').click(); true")
  await waitFor(`${plan('B900000004')}.entries.some(e => e.kind === 'afterschool')`, 'TT-01 only a chosen course is added')

  route(school(5))
  await waitFor(`${buttonReady('자료 없이 계속')} && window.qaReleaseDay`, 'TT-01 delayed dismissal has a bypass')
  answer('자료 없이 계속')
  answer('정규수업 끝나면 바로')
  await waitFor(step('dismissal'), 'TT-01 immediate pickup still needs a dismissal answer when school times are unavailable')
  answer('13:40')
  await waitFor(`${done} && ${completed}.length === 3`, 'TT-01 immediate pickup completes when the missing dismissal answer is saved')
  evaluate('window.qaReleaseDay(); true')
  await waitFor(`window.qaDayDelivered && ${plan('B900000005')}.entries.every(e => e.end === 820)`, 'TT-01 late public dismissal never overwrites parent input')
  assertPage(`${completed}.length === 3`, 'TT-01 delayed dismissal does not emit again')

  evaluate(`for (const k of ['${key}', 'elementary-favorites-v1', 'favorite-school-ids']) localStorage.removeItem(k); true`)
  open('/timetable?face=week')
  await waitFor("document.querySelector('.timetable-pick')", 'TT-01 clean second session for first care')
  click('학교 없이 시작')
  click('+ 일정 추가')
  formValue('.my-calendar-form input[maxlength]', '직접 입력 돌봄')
  formValue('.my-calendar-form select', 'care')
  blockWrites(true)
  click('저장', '.my-calendar-form')
  assertPage(`!${plan('no-school')} && ${events('timetable_draft_create')}.length === 0 && ${events('timetable_save_failure')}.length === 1`, 'TT-01 failed standalone save leaves no draft')
  blockWrites(false)
  click('저장', '.my-calendar-form')
  await waitFor(`${plan('no-school')}?.entries[0]?.kind === 'care' && ${events('timetable_draft_create')}.length === 1`, 'TT-01 retry saves care as the first standalone entry')
  open('/timetable?face=week')
  await waitFor("document.querySelector('.my-agenda__card--care')", 'TT-01 standalone care restores after reload')
  evaluate("document.querySelector('.my-agenda__card--care').click(); true")
  await waitFor("document.querySelector('dialog[open] input[type=time]')", 'TT-01 restored standalone care is editable')
  formValue('dialog[open] input[type=time]', '14:20')
  click('화', 'dialog[open] .my-entry-sheet__days')
  click('저장', 'dialog[open]')
  await waitFor(`${plan('no-school')}?.entries[0]?.start === 860 && ${plan('no-school')}?.entries[0]?.weekdays.includes(2)`, 'TT-01 care edit saves time and additional weekday')
  assertPage(`${log}.every(e => !JSON.stringify(e.params).includes('직접 입력 돌봄'))`, 'TT-01 free-entry titles are absent from analytics')
  evaluate(`window.qaCareSnapshot = ${plan('no-school')}.entries[0]; const current = {schoolId:'B900000001',schoolName:'QA School',entryYear:null,updatedAt:new Date().toISOString(),entries:[],starter:{returnAt:1020,care:false,courses:false,done:true}}; localStorage.setItem('${key}',JSON.stringify({version:1,plans:[...${plans},current]})); true`)
  route(school(1))
  await waitFor(`${done} && document.querySelector('.my-schedule')`, 'TT-01 opens an already completed school plan')
  click('직접 입력한 일정 가져오기')
  await waitFor(`!${plan('no-school')} && ${plan('B900000001')}.entries.some(e => JSON.stringify(e) === JSON.stringify(window.qaCareSnapshot))`, 'TT-01 imports standalone care into an existing school without altering user values')
  assertPage(`${completed}.length === 0`, 'TT-01 importing into a completed plan does not emit completion again')
}
