// Separate design fixtures from real marker clicks and data. No DB writes.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const prefix = ['--namespace', 'elementary-miniature-markers', '--session', `markers-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 25000
  while (!evaluate(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const open = route => run('open', new URL(route, base).href)
try {
  run('set', 'viewport', '390', '844')
  if (['localhost','127.0.0.1'].includes(new URL(base).hostname)) {
    open('/scripts/fixtures/miniature-markers.html')
    await wait("document.querySelectorAll('.map-marker-art svg').length===9", 'development-only school/apartment/care/activity art gallery renders')
    await wait("getComputedStyle(document.querySelector('.academy-map-marker--extended')).borderStyle==='dashed' && getComputedStyle(document.querySelector('.academy-map-marker--core')).borderStyle==='solid'", 'activity distance-band shapes remain distinct')
    if (process.argv[3]) run('screenshot',process.argv[3])
  }
  open('/school/서울-중구-서울흥인초등학교--B000002102')
  await wait("document.querySelector('.school-map-marker--selected .map-marker-art svg') && document.querySelector('.school-map-marker--selected .school-map-marker__count').textContent==='45명'", 'real school marker keeps grade-one count and miniature school art')
  await wait("document.querySelector('.apartment-map-marker__label .map-marker-art svg')", 'real apartment markers show miniature building art')
  await wait("[...document.querySelectorAll('.apartment-map-marker__label')].every(label=>label.querySelector('small').textContent==='세대' && label.scrollWidth<=label.clientWidth)", 'apartment numbers and units fit every marker without clipping')
  for (const width of [360,390,430,1280]) {
    run('set','viewport',String(width),'844')
    await wait("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.school-map-marker__count').getBoundingClientRect().width>0", `${width}px map keeps readable counts and no page overflow`)
  }
  run('set','viewport','390','844')
  if (process.argv[4]) run('screenshot',process.argv[4])
  // Real pointer events on a visible apartment label (not a synthetic SDK event).
  evaluate(`(() => {
    const marker=[...document.querySelectorAll('.apartment-map-marker__label')].find(node=>{
      const r=node.getBoundingClientRect();
      const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return r.top>180&&r.bottom<420&&r.left>12&&r.right<innerWidth-12&&hit&&node.contains(hit);
    }); if(marker)marker.dataset.qaClick='true'; return true;
  })()`)
  await wait("document.querySelector('[data-qa-click]')", 'a real apartment marker is visible for pointer selection')
  run('click','[data-qa-click]')
  await wait("document.querySelector('#assigned-school-title') && document.querySelector('.apartment-map-marker--selected') && location.pathname.startsWith('/apt/')", 'real marker click opens canonical apartment and selected state')
  open('/apt/서울-강남구-은마--7A2EMR5J')
  await wait("document.querySelector('.apartment-map-marker--selected .map-marker-art svg') && document.querySelector('.apartment-map-marker--selected strong').textContent==='4,424'", 'selected Eunma marker retains household count and building art')
  await wait("getComputedStyle(document.querySelector('.apartment-map-marker--selected .apartment-map-marker__label')).borderTopWidth==='2px'", 'selected large marker keeps a stronger selection border')
  evaluate("[...document.querySelectorAll('[aria-label=\"지도 탐색 영역\"] button')].find(b=>b.textContent==='배움·활동').click(); true")
  await wait("document.querySelector('.academy-map-marker .map-marker-art svg')", 'real activity layer uses miniature book art')
  await wait("[...document.querySelectorAll('.academy-map-marker')].every(marker=>marker.querySelector('strong').textContent.trim().length>0)", 'facility category labels remain alongside decorative art')
} finally { try { run('close') } catch { /* preserve first failure */ } }
