import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL; synthetic data and debug logging must stay local.')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-funnel', '--session', `funnel-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45_000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const wait = async (condition, label) => {
  const deadline = Date.now() + 20_000
  while (!evaluate(`(() => { try { return Boolean(${condition}) } catch { return false } })()`).includes('true')) {
    if (Date.now() >= deadline) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const count = event => `(window.__ANALYTICS_LOG__ || []).filter(e => e.event === ${JSON.stringify(event)}).length`
const route = target => evaluate(`history.pushState({}, '', ${JSON.stringify(target)}); dispatchEvent(new PopStateEvent('popstate')); true`)
const answer = text => evaluate(`[...document.querySelectorAll('.plan-starter button')].find(b => b.textContent.startsWith(${JSON.stringify(text)})).click(); true`)
const blockWrites = fail => evaluate(fail
  ? `window.qaOriginalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k==='elementary-schedule-plans-v1') throw new Error('QA private storage error'); return window.qaOriginalSet.call(this,k,v) }; true`
  : `Storage.prototype.setItem = window.qaOriginalSet; delete window.qaOriginalSet; true`)
try {
  run('open', new URL('/timetable?face=timeline', base).href, '--init-script', path.join(root, 'scripts/fixtures/funnel-network.js'))
  await wait(`${count('timetable_view')} === 1`, 'initial timeline screen is measured once in StrictMode')
  route('/timetable?face=week')
  await wait(`${count('timetable_view')} === 2`, 'same-path face switch is measured')
  route('/timetable?face=week&utm_source=qa')
  check(`${count('timetable_view')} === 2`, 'UTM-only rerender does not add a screen')
  route('/timetable?school=B900000001')
  await wait(`${count('timetable_school_pick')} === 1 && document.querySelector('.plan-starter')`, 'direct school entry waits for real screen resolution')
  check(`${count('timetable_view')} === 3 && ${count('page_view')} === 3`, 'direct school restoration has no intermediate duplicate page view')
  evaluate(`(() => { const schools = ['B900000001','B900000002'].map(id=>({kind:'school',id,name:'QA '+id,address:'QA',latitude:0,longitude:0})); localStorage.setItem('elementary-favorites-v1', JSON.stringify(schools)); dispatchEvent(new Event('storage')); return true })()`)
  await wait(`document.querySelector('[data-school-id=B900000002]')`, 'second saved school is available')
  evaluate(`document.querySelector('[data-school-id=B900000002]').click(); true`)
  await wait(`${count('timetable_school_pick')} === 2`, 'user school switch records one successful selection')
  check(`window.__ANALYTICS_LOG__.filter(e=>e.event==='timetable_school_pick').at(-1).params.selection_method==='user'`, 'user selection is distinct from route restoration')
  evaluate(`document.querySelector('[data-school-id=B900000002]').click(); true`)
  check(`${count('timetable_school_pick')} === 2`, 'same-school reselection does not add another selection')
  blockWrites(true)
  answer('정규수업 끝나면 바로')
  await wait(`${count('timetable_save_failure')} === 1`, 'failed initial write records failure')
  check(`${count('timetable_draft_create')} === 0 && !JSON.parse(localStorage.getItem('elementary-schedule-plans-v1') || '{"plans":[]}').plans.length`, 'failed creation neither counts nor persists a draft')
  blockWrites(false)
  answer('정규수업 끝나면 바로')
  await wait(`${count('timetable_draft_create')} === 1 && document.querySelector('.my-week-section')`, 'retry creates a stored draft and records success once across layout remount')
  check(`${count('timetable_save_success')} === 0 && ${count('timetable_first_edit')} === 0`, 'draft creation is not counted as an edit or another save')
  evaluate(`[...document.querySelectorAll('.my-schedule button')].find(b=>b.textContent==='질문 따라 다시 채우기').click(); true`)
  await wait(`${count('timetable_first_edit')} === 1 && ${count('timetable_save_success')} === 1`, 'first actual starter edit records edit then successful storage')
  blockWrites(true)
  answer('19시쯤')
  await wait(`${count('timetable_save_failure')} === 2`, 'existing draft write failure is measured separately')
  check(`${count('timetable_first_edit')} === 1 && ${count('timetable_save_success')} === 1`, 'failed edit does not report success or repeat first edit')
  blockWrites(false)
  answer('19시쯤')
  await wait(`${count('timetable_save_success')} === 2`, 'retry persists the existing draft')
  check(`!JSON.stringify(window.__ANALYTICS_LOG__.filter(e=>e.params.measurement_version)).includes('returnAt') && !JSON.stringify(window.__ANALYTICS_LOG__).includes('QA private storage error')`, 'answer values and error text are absent from events')
  check(`!document.querySelector('script[src*="googletagmanager"]')`, 'local debug flow makes no GA transport')
  run('reload')
  await wait(`document.querySelector('.plan-starter[data-step=care]') && ${count('timetable_school_pick')} === 1`, 'reload restores persisted answers and the selected school')
  check(`${count('timetable_draft_create')} === 0 && ${count('timetable_save_success')} === 0`, 'restoration is not counted as creation or save')
  route('/timetable?face=timeline')
  await wait(`${count('timetable_view')} === 2`, 'timeline return is recorded')
  evaluate(`history.back(); true`)
  await wait(`${count('timetable_view')} === 3 && document.querySelector('.my-week-section')`, 'history return restores week and records exactly one view')
  process.stdout.write('Funnel measurement browser smoke passed.\n')
} finally {
  spawnSync(process.execPath, [cli, ...prefix, 'close'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
}
