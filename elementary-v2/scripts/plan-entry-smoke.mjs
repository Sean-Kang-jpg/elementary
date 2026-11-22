import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL: isolated storage tests only.')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-plan-entry', '--session', `entry-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  console.log(`PASS: ${label}`)
}
const wait = async (condition, label) => {
  const deadline = Date.now() + 20000
  while (!evaluate(`(() => { try { return Boolean(${condition}) } catch { return false } })()`).includes('true')) {
    if (Date.now() > deadline) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  console.log(`PASS: ${label}`)
}
const route = target => evaluate(`history.pushState({}, '', ${JSON.stringify(target)}); dispatchEvent(new PopStateEvent('popstate')); true`)
const count = event => `(window.__ANALYTICS_LOG__ || []).filter(e => e.event === ${JSON.stringify(event)}).length`
try {
  run('open', new URL('/timetable?school=B900000001', base).href, '--init-script', path.join(root, 'scripts/fixtures/funnel-network.js'))
  run('set', 'viewport', '390', '844')
  await wait(`document.querySelector('[data-testid=plan-starter]')`, 'selected school opens the first question')
  await wait(`document.querySelector('[data-testid=school-pickup-preview] button[type=submit]')?.disabled === false`, 'pickup preview is ready for the selected school')
  check(`(() => { const b=document.querySelector('[data-testid=school-pickup-preview] button[type=submit]').getBoundingClientRect(); const nav=document.querySelector('.app-gnb')?.getBoundingClientRect().top || innerHeight; return b.top>=0 && b.bottom<nav && document.documentElement.scrollWidth===innerWidth })()`, 'pickup action fits the 390px screen')
  evaluate(`(() => { const input=document.querySelector('[data-testid=school-pickup-preview] input[type=time]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'17:00'); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
  evaluate(`document.querySelector('[data-testid=school-pickup-preview] form').requestSubmit(); true`)
  await wait(`document.querySelector('[data-testid=school-pickup-result]').textContent.includes('4시간')`, '13:00 fixture dismissal leaves four hours before 17:00 pickup')
  check(`${count('pickup_gap_check')} === 1`, 'successful preview records one result event')
  evaluate(`Array.from(document.querySelectorAll('[data-testid=school-pickup-preview] button')).find(b=>b.textContent.includes('한 주')).click(); true`)
  await wait(`document.querySelector('[data-testid=timetable-week-editor]').textContent.includes('금요일 17:00 픽업')`, 'weekly editor retains the selected weekday and pickup context')
  check(`${count('timetable_draft_create')} === 0`, 'preview does not write a draft')
  check(`!document.querySelector('.timetable-school-change').open && !document.querySelector('.timetable-source').open`, 'school changes and source details remain available but collapsed')
  check(`document.querySelector('.my-schedule').getBoundingClientRect().top < document.querySelector('.timetable-source').getBoundingClientRect().top`, 'first action precedes public operating data')
  evaluate(`document.querySelector('.plan-starter__choices button').click(); true`)
  await wait(`document.querySelector('.plan-starter[data-step=care]')`, 'answer creates the draft and continues')
  check(`${count('timetable_draft_create')} === 1`, 'moving the layout does not duplicate draft creation')
  run('reload')
  await wait(`document.querySelector('.plan-starter[data-step=care]')`, 'reload restores the existing answers')
  check(`${count('timetable_draft_create')} === 0`, 'restoring the draft does not count as new creation')
  route('/guide/private-national')
  await wait(`document.querySelector('[data-testid=guide-plan-add]')`, 'guide save action is available')
  evaluate(`document.querySelector('[data-testid=guide-plan-add]').click(); true`)
  await wait(`document.querySelector('[data-testid=guide-plan-add]').disabled`, 'guide save is confirmed')
  check(`document.querySelector('[data-testid=guide-next-step-preview]').textContent === '담은 할 일 보기'`, 'saved guide offers a direct item link')
  evaluate(`document.querySelector('[data-testid=guide-next-step-preview]').click(); true`)
  await wait(`document.querySelector('.plan-item--focused')`, 'timeline highlights the saved item without choosing an entry year')
  check(`document.activeElement === document.querySelector('.plan-item--focused') && document.activeElement.dataset.planItem === 'guide-private-national-followup'`, 'keyboard focus moves to the specific saved item')
  evaluate(`localStorage.setItem('wherecho:profile-v1',JSON.stringify({entryYear:2027,interest:['public'],moving:'none'})); true`)
  run('reload')
  await wait(`document.querySelector('#roadmap-title') && document.querySelector('.plan-item--focused')`, 'same item is highlighted inside the entry-year roadmap')
  check(`document.querySelectorAll('.plan-item--focused').length === 1`, 'only the intended task is highlighted')
  evaluate(`localStorage.clear(); localStorage.setItem('wherecho:analytics-debug','1'); true`)
  run('open', new URL('/timetable?face=week', base).href)
  await wait(`document.querySelector('.timetable-pick')`, 'fresh visitor reaches school search')
  check(`!document.querySelector('.timetable-steps') && !document.querySelector('.timetable-sample').open`, 'school search has no redundant steps and the example is optional')
  evaluate(`document.querySelector('.timetable-sample > summary').click(); true`)
  check(`document.querySelectorAll('.sample-week .my-week__day').length === 5 && document.documentElement.scrollWidth === innerWidth`, 'expanded example keeps all five days without mobile overflow')
  run('open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', base).href)
  await wait(`document.querySelector('[data-testid=school-plan-primary]')`, 'school detail offers a primary plan link without opening care')
  check(`(() => { const r=document.querySelector('[data-testid=school-plan-primary]').getBoundingClientRect(); const nav=document.querySelector('.app-gnb')?.getBoundingClientRect().top || innerHeight; return r.top>=0 && r.bottom<nav })()`, 'school plan link fits the first mobile sheet view')
  evaluate(`document.querySelector('[data-testid=school-plan-primary]').click(); true`)
  await wait(`location.pathname === '/timetable' && location.search.includes('school=B000002292') && document.querySelector('[data-testid=plan-starter]')`, 'school detail opens the correct school and its schedule')
  check(`document.querySelector('[data-testid=school-pickup-preview]') !== null`, 'school detail entry exposes the same pickup preview')
  check(`window.__ANALYTICS_LOG__.filter(e=>e.event==='plan_start').length === 1 && window.__ANALYTICS_LOG__.find(e=>e.event==='plan_start').params.from==='school_detail'`, 'primary school entry records the existing start contract once')
  route('/guide/dismissal-time')
  await wait(`document.querySelector('[data-testid=guide-next-step-preview]')?.textContent.includes('예상 하교 시각')`, 'dismissal guide links to the stated outcome')
  evaluate(`document.querySelector('[data-testid=guide-next-step-preview]').click(); true`)
  await wait(`location.pathname === '/timetable' && (document.querySelector('.timetable-pick') || document.querySelector('[data-testid=school-pickup-preview]'))`, 'guide opens school selection or the available pickup preview')
  console.log('Plan entry UX browser smoke passed.')
} finally {
  spawnSync(process.execPath, [cli, ...prefix, 'close'], { cwd: root, encoding: 'utf8', timeout: 15000 })
}
