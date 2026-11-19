import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL: isolated storage tests only.')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-guide-plan', '--session', `guide-${process.pid}`]
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
  run('open', new URL('/guide/private-national', base).href, '--init-script', path.join(root, 'scripts/fixtures/funnel-network.js'))
  run('set', 'viewport', '390', '844')
  await wait(`document.querySelector('[data-testid=guide-plan-add]')`, 'guide offers a concrete action before the article')
  evaluate(`localStorage.clear(); localStorage.setItem('wherecho:analytics-debug','1'); true`)
  run('reload')
  await wait(`document.querySelector('[data-testid=guide-plan-add]')`, 'fresh visitor sees save action')
  evaluate(`window.qaSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'wherecho:family-plan-v1') throw new Error('QA write failure'); return window.qaSet.call(this,k,v) }; document.querySelector('[data-testid=guide-plan-add]').click(); true`)
  await wait(`document.querySelector('.guide-next-action [role=status]').textContent.includes('저장하지 못')`, 'write failure is visible')
  check(`${count('plan_item_add')} === 0 && !document.querySelector('[data-testid=guide-plan-add]').disabled`, 'failed save stays actionable and sends no success event')
  evaluate(`Storage.prototype.setItem = window.qaSet; document.querySelector('[data-testid=guide-plan-add]').click(); true`)
  await wait(`document.querySelector('[data-testid=guide-plan-add]').disabled`, 'successful save is confirmed')
  check(`${count('plan_item_add')} === 1 && ${count('plan_start')} === 1`, 'first real save records one addition and one start')
  check(`JSON.parse(localStorage.getItem('wherecho:family-plan-v1')).pinned[0].when.kind === 'anytime' && !localStorage.getItem('wherecho:profile-v1')`, 'save invents no date and does not choose a profile')
  evaluate(`document.querySelector('[data-testid=guide-next-step-preview]').click(); true`)
  await wait(`location.search.startsWith('?face=timeline') && document.querySelector('#pinned-plan-title')`, 'timeline shows saved task even without entry year')
  check(`document.querySelector('.roadmap').textContent.includes('지원한 학교의 추첨·등록 공지 확인하기') && ${count('guide_next_step_click')} === 1`, 'saved subject survives navigation and click is measured separately')
  route('/guide/private-national')
  await wait(`document.querySelector('[data-testid=guide-plan-add]')?.disabled`, 'return shows already saved state')
  evaluate(`document.querySelector('[data-testid=guide-plan-add]').click(); true`)
  check(`${count('plan_item_add')} === 1`, 'repeat click cannot add twice')
  for (const slug of ['morning-care', 'care-afterschool', 'care-waitlist', 'dismissal-time', 'first-weeks']) {
    route('/guide/' + slug)
    await wait(`document.querySelector('#guide-title') && document.querySelector('[data-testid=guide-next-step-preview]')?.getAttribute('href') === '/timetable?face=week'`, `${slug} explicitly links to week`)
    evaluate(`document.querySelector('[data-testid=guide-next-step-preview]').click(); true`)
    await wait(`location.search === '?face=week' && document.querySelector('.timetable-pick')`, `${slug} opens school selection in week`)
  }
  evaluate(`localStorage.setItem('wherecho:profile-v1',JSON.stringify({entryYear:2029,interest:['public'],moving:'none'})); true`)
  run('reload')
  route('/guide/preliminary-call')
  await wait(`document.querySelector('[data-testid=guide-plan-add]')`, 'another guide has its own action')
  evaluate(`window.qaProfile = localStorage.getItem('wherecho:profile-v1'); document.querySelector('[data-testid=guide-plan-add]').click(); true`)
  await wait(`document.querySelector('[data-testid=guide-plan-add]').disabled`, 'existing family can save another subject')
  check(`localStorage.getItem('wherecho:profile-v1') === window.qaProfile && ${count('plan_start')} === 0`, 'existing profile is preserved and not counted as new start')
  check(`document.documentElement.scrollWidth === innerWidth && document.querySelector('.guide-next-action').getBoundingClientRect().top < document.querySelector('.content-body').getBoundingClientRect().top`, '390px guide layout has no overflow and action precedes the article')
  console.log('Guide planning browser smoke passed.')
} finally {
  spawnSync(process.execPath, [cli, ...prefix, 'close'], { cwd: root, encoding: 'utf8', timeout: 15000 })
}

