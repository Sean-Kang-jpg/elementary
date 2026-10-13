import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const prefix = ['--namespace', 'elementary-apartment-visual', '--session', `visual-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = (code) => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const open = route => run('open', new URL(route, base).href)
try {
  run('set', 'viewport', '390', '844')
  if (new URL(base).hostname === 'localhost' || new URL(base).hostname === '127.0.0.1') {
    open('/scripts/fixtures/apartment-visual.html')
    await wait("document.querySelectorAll('[data-fixture-age] svg').length === 16", 'development-only 16 age/scale combinations render')
    await wait(`(() => {
      const count=size=>size>=3000?4:size>=1000?3:size>=300?2:1;
      return [...document.querySelectorAll('[data-fixture-age]')].every(item=>{
        const svg=item.querySelector('svg'); const age=item.dataset.fixtureAge;
        const era=age==='null'?'unknown':Number(age)<=10?'new':Number(age)<=25?'mid':'old';
        return svg.dataset.apartmentEra===era && svg.querySelectorAll('[data-building-silhouette]').length===count(Number(item.dataset.fixtureHouseholds));
      });
    })()`, 'all age colours and original density tiers remain meaningful')
    await wait("[...document.querySelectorAll('[data-fixture-age] svg')].every(svg=>svg.dataset.apartmentStyle==='miniature' && svg.querySelector('[data-scene-garden]') && svg.querySelector('[data-scene-plants]'))", 'all icons use filled miniature buildings, a garden and plants')
    await wait(`(() => {
      const geometries=[5,15,33,'null'].map(age=>[...document.querySelectorAll('[data-fixture-age="'+age+'"] [data-building-silhouette] > rect:first-child')].map(rect=>['x','y','width','height','rx'].map(key=>rect.getAttribute(key)).join(',')).join(';'));
      return new Set(geometries).size===1 && document.documentElement.scrollWidth<=innerWidth;
    })()`, 'building geometry never changes with age and fixture has no mobile overflow')
    await wait("document.querySelector('.apartment-card svg[data-apartment-era=unknown]') && document.querySelector('[data-testid=apartment-age-badge]').textContent==='연식 미확인'", 'missing age has a neutral icon and explicit unknown badge, not new')
    if (process.argv[3]) run('screenshot', process.argv[3], '--full')
  }
  open('/apt/서울-강남구-은마--7A2EMR5J')
  await wait("document.querySelector('.apartment-card svg[data-apartment-era=old][data-apartment-scale=\"4\"]') && document.querySelector('[data-testid=apartment-age-badge]')?.textContent.includes('년차')", 'real Eunma detail shows four density silhouettes and a known-age badge')
  await wait("document.querySelector('.apartment-card svg[data-apartment-style=miniature] [data-scene-plants]')", 'real card uses the visibly different miniature scene')
  await wait("document.querySelector('.apartment-card b').textContent==='4,424세대' && document.querySelector('.apartment-card').textContent.includes('28개 동') && document.querySelector('.apartment-card').textContent.includes('1979년')", 'actual households, physical building count and approval year stay unchanged')
  evaluate("document.querySelector('.apartment-card').scrollIntoView({block:'start'}); true")
  if (process.argv[4]) run('screenshot', process.argv[4])
  for (const width of [360,390,430,1280]) {
    run('set','viewport',String(width),'844')
    await wait("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.apartment-card__visual').getBoundingClientRect().width===64", `${width}px real detail keeps a compact, unclipped icon`)
  }
  open('/school/서울-중구-서울흥인초등학교--B000002102')
  await wait("document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'real school opens')
  evaluate("[...document.querySelectorAll('[aria-label=\"학교 상세 메뉴\"] button')].find(b=>b.textContent==='배정·통학').click(); true")
  await wait("document.querySelectorAll('.apartment-card svg[data-apartment-era]').length>0 && [...document.querySelectorAll('.apartment-card')].every(card=>card.querySelector('[data-testid=apartment-age-badge]'))", 'assigned apartment list reuses the same icon and age badges')
} finally { try { run('close') } catch { /* preserve first failure */ } }
