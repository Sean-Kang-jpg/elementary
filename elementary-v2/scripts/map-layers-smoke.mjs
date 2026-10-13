// Real map/assignment/activity reads; care mocks are isolated to local QA only.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname)
const prefix = ['--namespace', 'elementary-map-layers', '--session', `layers-${process.pid}`]
if (local) prefix.push('--init-script', path.join(root, 'scripts/fixtures/map-layers-network.js'))
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const wait = async (condition, label) => {
  const until = Date.now() + 25000
  while (!evaluate(`(() => { try { return Boolean(${condition}) } catch { return false } })()`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const open = route => run('open', new URL(route, base).href)
const floating = layer => `[data-layer-entry="floating"][data-map-layer="${layer}"]`
const banner = layer => `[data-layer-entry="banner"][data-map-layer="${layer}"]`
const toggle = layer => run('click', floating(layer))
const topic = label => evaluate(`[...document.querySelectorAll('[aria-label="지도 탐색 영역"] button')].find(x=>x.textContent===${JSON.stringify(label)}).click(); true`)
const matchingState = layer => `document.querySelector(${JSON.stringify(floating(layer))}).getAttribute('aria-pressed')===document.querySelector(${JSON.stringify(banner(layer))}).getAttribute('aria-pressed')`
const school = "document.querySelector('.school-map-marker--selected')"
const apartment = "document.querySelector('.apartment-map-marker--selected')"
const activity = "document.querySelector('.academy-map-marker, .academy-map-cluster')"
const care = "document.querySelector('.care-map-marker')"
try {
  run('set', 'viewport', '390', '844')
  open('/map')
  await wait("document.querySelectorAll('.map-layer-controls button').length===3", 'three direct push buttons render together before selection')
  check("document.querySelectorAll('.map-layer-controls button:disabled').length===3", 'all dependent layers explain missing origin before selection')
  check("!document.querySelector('.map-layer-panel, [role=switch]')", 'no dropdown or draggable switch is used')
  open('/apt/서울-강남구-은마--7A2EMR5J')
  await wait(apartment, 'real apartment deep link restores its selected household marker')
  check("document.querySelectorAll('.map-layer-controls button').length===3 && document.querySelectorAll('.map-layer-controls button:disabled').length===0", 'all three buttons are together for a selected apartment and assigned school')
  evaluate(`window.qaSchoolPosition=(() => { const r=${school}.getBoundingClientRect(); return {x:r.x,y:r.y} })(); true`)
  toggle('care')
  toggle('activity')
  await wait(activity, 'real education facilities load alongside assigned apartment markers')
  if (local) {
    await wait(care, 'local-only mocked care center renders with real apartment and education markers')
    check("window.qaCareRequest.p_max_distance_m===1000 && Number.isFinite(window.qaCareRequest.p_latitude) && Number.isFinite(window.qaCareRequest.p_longitude)", 'care API keeps the existing origin coordinates and fixed 1000m payload')
  }
  else await wait("document.querySelector('[data-layer-entry=floating][data-map-layer=care]').getAttribute('aria-busy')==='false'", 'production care lookup reaches a non-loading state without fabricated rows')
  check(`${apartment} && ${school}`, 'school and selected apartment remain visible when facilities are on')
  check("[...document.querySelectorAll('.map-layer-controls button')].every(x=>x.getAttribute('aria-pressed')==='true')", 'all three independent push buttons remain on')
  check("location.pathname.startsWith('/apt/') && document.querySelector('[aria-label=\"지도 탐색 영역\"] button[aria-pressed=true]').textContent==='배정·통학'", 'switches preserve apartment URL and detail topic')
  check(`(() => { const r=${school}.getBoundingClientRect(); return Math.abs(r.x-window.qaSchoolPosition.x)<2 && Math.abs(r.y-window.qaSchoolPosition.y)<2 })()`, 'turning on layers does not fit bounds or move the map')
  if (process.argv[3]) run('screenshot', process.argv[3])
  check("document.querySelector('#assigned-school-title') && document.querySelectorAll('[data-testid=bottom-sheet]').length===1", 'push controls leave the selected detail and single sheet intact')
  if (local) check(`(() => { const r=${care}.getBoundingClientRect(); const sheet=document.querySelector('[data-testid=bottom-sheet]').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>150 && r.bottom<sheet.top })()`, 'local care fixture lies within the map viewport above the sheet, rather than off-screen')
  if (process.argv[4]) run('screenshot', process.argv[4])
  for (const [layer, marker, other] of [['apartments', apartment, activity], ['activity', activity, apartment], ['care', care, apartment]]) {
    toggle(layer)
    await wait(`!(${marker}) && (${other})`, `${layer} off removes only its markers`)
    toggle(layer)
    if (layer !== 'care' || local) await wait(marker, `${layer} on restores its markers`)
  }
  // Both entry points toggle the same state; actions must not navigate or hide content.
  for (const [layer, label, content] of [['apartments','배정·통학','#assigned-school-title'],['activity','배움·활동','#academy-title'],['care','방과후·돌봄','[data-testid=care-centers]']]) {
    topic(label)
    await wait(`document.querySelector(${JSON.stringify(banner(layer))}) && document.querySelector(${JSON.stringify(content)})`, `${layer} detail shows its top banner and existing content`)
    check(matchingState(layer), `${layer} banner agrees with floating button`)
    evaluate(`window.qaLayerColour=getComputedStyle(document.querySelector(${JSON.stringify(floating(layer))})).backgroundColor; true`)
    run('click', banner(layer))
    await wait(`(${matchingState(layer)}) && document.querySelector(${JSON.stringify(floating(layer))}).getAttribute('aria-pressed')==='false'`, `${layer} banner turns off its floating button`)
    check(`getComputedStyle(document.querySelector(${JSON.stringify(floating(layer))})).backgroundColor!==window.qaLayerColour && document.querySelector(${JSON.stringify(content)}) && location.pathname.startsWith('/apt/')`, `${layer} push changes colour but retains content and apartment URL`)
    toggle(layer)
    await wait(`(${matchingState(layer)}) && document.querySelector(${JSON.stringify(banner(layer))}).textContent.includes('표시 끄기')`, `${layer} floating button restores its banner`)
  }
  topic('배정·통학')
  for (const width of [360,390,430,1280]) {
    run('set', 'viewport', String(width), '844')
    check("(() => { const r=document.querySelector('.map-layer-controls').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth })()", `${width}px buttons stay within the viewport without horizontal overflow`)
    check("[...document.querySelectorAll('.map-layer-controls button, [data-layer-entry=banner]')].every(x=>x.getBoundingClientRect().height>=44)", `${width}px floating and banner buttons keep accessible touch heights`)
  }
  run('set', 'viewport', '390', '844')
  run('focus', floating('apartments'))
  run('press', 'Space')
  await wait(`(${matchingState('apartments')}) && document.querySelector(${JSON.stringify(floating('apartments'))}).getAttribute('aria-pressed')==='false'`, 'keyboard Space toggles push button and banner together')
  run('press', 'Space')
  await wait(apartment, 'keyboard Space restores selected apartment marker')
  // School sheets use the same banner; school overview itself gets no irrelevant banner.
  open('/school/서울-강남구-서울대현초등학교--B000002292')
  await wait("document.querySelector('#first-grade-title')", 'school overview restored')
  check("!document.querySelector('[data-layer-entry=banner]')", 'school overview has no unrelated layer banner')
  for (const [layer, label] of [['apartments','배정·통학'],['activity','배움·활동'],['care','방과후·돌봄']]) {
    topic(label)
    await wait(`document.querySelector(${JSON.stringify(banner(layer))})`, `${layer} school detail has the same banner entry`)
    run('click', banner(layer))
    await wait(`(${matchingState(layer)}) && document.querySelector(${JSON.stringify(floating(layer))}).getAttribute('aria-pressed')==='false'`, `${layer} school banner can turn its map layer off`)
    toggle(layer)
    check(matchingState(layer), `${layer} school floating button synchronizes its banner`)
  }
  if (local) {
    evaluate("[...document.querySelectorAll('[aria-label=\"지도 탐색 영역\"] button')].find(x=>x.textContent==='방과후·돌봄').click(); true")
    await wait("document.querySelector('[data-testid=care-centers] button[aria-label$=\"상세 안내\"]')", 'mocked center is available in the existing school-origin list')
    evaluate("document.querySelector('[data-testid=care-centers] button[aria-label$=\"상세 안내\"]').click(); true")
    await wait("document.querySelector('[data-testid=map-place-detail]')", 'center opens the common detail sheet')
    toggle('care')
    await wait(`!document.querySelector('[data-testid=map-place-detail]') && !(${care}) && (${activity}) && document.querySelector('.apartment-map-marker')`, 'hiding care closes only care detail and retains other layers')
    evaluate("window.qaCareMode='error'; true")
    toggle('care')
    await wait("document.querySelector('[data-layer-entry=floating][data-map-layer=care]').textContent.includes('조회 실패')", 'care request failure is visible and not presented as zero centers')
    toggle('care')
    evaluate("window.qaCareMode='empty'; true")
    toggle('care')
    await wait("document.querySelector('[data-layer-entry=floating][data-map-layer=care]').title.includes('조회 결과 0곳')", 'successful empty care response remains distinct from request failure')
  }
  check("!document.querySelector('.academy-layer-toggle, .care-map-chip, .academy-map-legend, .map-layer-panel')", 'legacy controls and dropdown are replaced by direct push buttons')
  process.stdout.write('Map-layer smoke passed. Local care fixtures are not production records.\n')
} catch (error) {
  process.stdout.write(`QA diagnostic: ${evaluate("JSON.stringify({buttons:document.querySelector('.map-layer-controls')?.textContent,careMarkers:document.querySelectorAll('.care-map-marker').length,facilityMarkers:document.querySelectorAll('.academy-map-marker, .academy-map-cluster').length,careResponse:window.qaCareResponse})")}\n`)
  throw error
} finally {
  try { run('close') } catch { /* preserve original failure */ }
}
