// Isolated browser storage; public school reads only, no production data writes.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const school = '/school/서울-중구-서울흥인초등학교--B000002102'
const prefix = ['--namespace', 'elementary-start-module', '--session', `start-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = (code) => run('eval', code)
const open = (route) => run('open', new URL(route, base).href)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const matchingGuide = `(() => {
  const year = JSON.parse(localStorage.getItem('wherecho:profile-v1')).entryYear;
  const admission = new Date() >= new Date(year - 1, 8, 1);
  const groups = document.querySelectorAll('.start-module__group');
  const links = document.querySelectorAll('.start-module a');
  return groups.length === 1 && links.length === 1
    && groups[0].querySelector(admission ? '.stage-chip--admission' : '.stage-chip--planning')
    && links[0].getAttribute('href') === (admission ? '/guide/school-notice' : '/guide/when-to-move');
})()`
try {
  run('set', 'viewport', '390', '844')
  open('/my')
  await wait("document.querySelector('#my-title')", 'MY loads for an isolated unselected profile')
  evaluate("localStorage.removeItem('wherecho:profile-v1'); true")
  open(school)
  await wait("document.querySelectorAll('.start-module__group').length === 2 && [...document.querySelectorAll('.start-module__group')].every(group => group.querySelectorAll('a').length === 1)", 'unselected year shows two first-item guides only')
  await wait("document.querySelector('.start-module a[href=\"/guide/school-notice\"]') && document.querySelector('.start-module a[href=\"/guide/when-to-move\"]') && !document.querySelector('.start-module a[href=\"/guide/preliminary-call\"], .start-module a[href=\"/guide/check-school-zone\"]')", 'original first guides retained and second guides omitted')
  if (process.argv[3]) run('screenshot', process.argv[3])
  for (let index = 0; index < 3; index++) {
    open('/my')
    await wait("document.querySelector('#my-title')", 'MY opens to change year')
    evaluate("document.querySelector('.hub-profile__edit')?.click(); true")
    await wait("document.querySelectorAll('.my-preparation .year-chip').length === 3", 'MY year choices remain available')
    evaluate(`document.querySelectorAll('.my-preparation .year-chip')[${index}].click(); true`)
    await wait("document.querySelector('.my-preparation .hub-profile')", 'MY stores the selected year')
    open(school)
    await wait(matchingGuide, `year choice ${index + 1} shows only its stage and first guide`)
    await wait("document.documentElement.scrollWidth <= innerWidth", 'compact school module has no mobile overflow')
  }
  if (process.argv[4]) run('screenshot', process.argv[4])
  evaluate("document.querySelector('.start-module a').click(); true")
  await wait("document.querySelector('#guide-title')", 'retained guide opens through app navigation')
  evaluate("history.back(); true")
  await wait(matchingGuide, 'back restores school and selected-stage module')
  run('set', 'viewport', '1280', '900')
  await wait("document.documentElement.scrollWidth <= innerWidth", 'desktop layout has no overflow')
} finally { try { run('close') } catch { /* preserve first failure */ } }
