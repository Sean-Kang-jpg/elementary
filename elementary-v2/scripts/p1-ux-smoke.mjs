// Focused P1 regression using real public data. This does not replace the
// full public smoke gate: SDK rendering/marker clicks still need that gate.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:4173'
const prefix = ['--namespace', 'elementary-p1-smoke', '--session', `p1-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45_000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${args[0]}`)
  return result.stdout.trim()
}
const check = (condition, label) => {
  run('eval', `(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return 'OK' })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const wait = async (condition, label) => {
  const until = Date.now() + 20_000
  while (!run('eval', `(() => { try { return (${condition}) ? 'READY' : 'WAIT' } catch { return 'WAIT' } })()`).includes('READY')) {
    if (Date.now() >= until) throw new Error(`Timed out: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const open = (route) => run('open', new URL(route, base).href)
const topic = (label) => run('eval', `[...document.querySelectorAll('[aria-label="지도 탐색 영역"] button')].find(x => x.textContent === ${JSON.stringify(label)}).click(); 'topic'`)
const school = '/school/서울-강남구-서울대현초등학교--B000002292'
const apartment = '/apt/서울-강남구-은마--7A2EMR5J'

try {
  run('set', 'viewport', '390', '844')
  open('/')
  await wait("document.querySelector('#home-title')", 'home loads')
  check("![...document.querySelectorAll('.home-page__card')].some(x => x.textContent.includes('지역별 배정'))", 'home comparison banner removed')
  check("document.querySelector('.home-page__footer a[href=\"/area\"]')", 'area directory entry preserved')
  open('/guide')
  await wait("document.querySelector('#guides-title')", 'admission guide loads')
  check("!document.querySelector('.content-page a[href=\"/news\"]')", 'data report banner removed')
  open('/news')
  await wait("document.querySelector('#news-title')", 'existing news URL retained')
  open(school)
  await wait("document.querySelector('#first-grade-title') && document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'school deep link restores overview and tabs')
  check("decodeURIComponent(location.pathname).endsWith('B000002292')", 'school canonical URL preserved')
  topic('방과후·돌봄')
  await wait("document.querySelector('[data-testid=school-care]') && document.querySelector('[data-testid=care-centers]')", 'care topic shows actual disclosure and fixed-radius center list')
  check("document.querySelector('[aria-label=\"학교 상세 메뉴\"] button[aria-pressed=true]')?.textContent === '방과후·돌봄'", 'school tab synchronized with top topic')
  check("document.querySelector('[data-testid=care-centers]').textContent.includes('학교 기준 직선거리 1km')", 'care distance remains school-origin 1km')
  check("!document.querySelector('[data-testid=care-centers] select')", 'no distance selector introduced')
  run('eval', "document.querySelector('[aria-label=\"종속 조건\"] button').click(); 'menu'")
  await wait("document.querySelector('[role=menu]')", 'care disclosure menu opens')
  check("document.querySelector('[role=menuitemradio][aria-checked=true]') === document.activeElement", 'menu focuses current option')
  check("document.querySelector('[role=menu]').getBoundingClientRect().right <= innerWidth", 'long care menu stays within mobile screen')
  run('press', 'Escape')
  check("!document.querySelector('[role=menu]') && document.querySelectorAll('[data-testid=bottom-sheet]').length === 1", 'Escape closes only the menu, not school detail')
  check("document.activeElement?.getAttribute('aria-expanded') === 'false'", 'Escape returns focus to trigger')

  if (run('eval', "Boolean(document.querySelector('[data-testid=care-centers] button[aria-label$=\"상세 안내\"]'))").includes('true')) {
    run('eval', "document.querySelector('[data-testid=care-centers] button[aria-label$=\"상세 안내\"]').click(); 'center'")
    await wait("document.querySelector('[data-testid=map-place-detail]')", 'real center opens common type-specific sheet')
    check("document.querySelectorAll('[data-testid=bottom-sheet]').length === 1", 'facility selection does not stack duplicate sheets')
    check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('현재 여석을 뜻하지')", 'capacity is not presented as vacancy')
    run('eval', "[...document.querySelectorAll('[aria-label=\"돌봄센터 상세 메뉴\"] button')].find(x => x.textContent === '출처·확인').click(); 'source'")
    check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('별도 운영 확인일: 미확인')", 'source modification and unverified operating date separated')
    check("decodeURIComponent(location.pathname).endsWith('B000002292')", 'center selection preserves school URL')
    run('eval', "history.back(); 'back'")
    await wait("!document.querySelector('[data-testid=map-place-detail]') && document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'back closes center and restores school sheet')
    run('eval', "document.querySelector('[data-testid=care-centers] button[aria-label$=\"상세 안내\"]').click(); 'center'")
    await wait("document.querySelector('[data-testid=map-place-detail]')", 'center reopens')
    run('eval', "document.querySelector('button[aria-label=\"상세 정보 닫기\"]').click(); 'close'")
    await wait("!document.querySelector('[data-testid=map-place-detail]') && document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'close restores school without changing entity URL')
  } else {
    process.stdout.write('SKIP: this sample UI shows no center rows; center detail needs a separate fixture\n')
  }

  topic('배정·통학')
  await wait("document.querySelector('[aria-label=\"학교 상세 메뉴\"] button[aria-pressed=true]')?.textContent === '배정·통학'", 'assignment topic opens assigned-apartment list')
  check("document.querySelector('[aria-label=\"종속 조건\"]').textContent.includes('세대 수') && !document.querySelector('[aria-label=\"종속 조건\"]').textContent.includes('저녁돌봄')", 'assignment shows apartment conditions only')
  topic('배움·활동')
  await wait("document.querySelector('#academy-category-title')", 'activity topic reads existing public facility data')
  check("document.querySelector('[aria-label=\"학교 상세 메뉴\"] button[aria-pressed=true]')?.textContent === '배움·활동'", 'activity sheet synchronized')
  const category = JSON.parse(run('eval', "(() => { const button = document.querySelector('#academy-category-title + p + div button'); return [...document.querySelector('select[aria-label=\"활동 분야\"]').options].find(x => x.value && button.textContent.includes(x.textContent)).value })()"))
  run('select', 'select[aria-label="활동 분야"]', category)
  await wait("[...document.querySelectorAll('#academy-category-title + p + div button[aria-pressed=true]')].some(x => x.textContent.includes(document.querySelector('select[aria-label=\"활동 분야\"]').selectedOptions[0].textContent))", 'activity field filter synchronized with an actually published category')
  check("document.querySelector('[data-testid=bottom-sheet]').textContent.includes('초등학생 대상 강좌와 모집 여부')", 'facility classification does not assert elementary eligibility')
  for (const width of [360, 390, 430, 1280]) {
    run('set', 'viewport', String(width), '844')
    await wait("document.documentElement.scrollWidth === innerWidth", `${width}px activity layout has no page overflow`)
    check("document.querySelectorAll('[data-testid=bottom-sheet]').length === 1", `${width}px uses one detail sheet`)
  }
  run('set', 'viewport', '390', '844')
  open(apartment)
  await wait("document.querySelector('#assigned-school-title')", 'apartment deep link restores assignment view')
  check("document.querySelector('[aria-label=\"지도 탐색 영역\"] button[aria-pressed=true]')?.textContent === '배정·통학'", 'apartment selection activates assignment topic')
  topic('방과후·돌봄')
  await wait("document.querySelector('[data-testid=care-centers]')", 'apartment care tab uses assigned school')
  check("document.querySelector('[data-testid=care-centers]').textContent.includes('학교 기준 직선거리 1km')", 'apartment care does not change distance origin')
  topic('배움·활동')
  await wait("document.querySelector('#academy-title')", 'apartment activity tab renders')
  check(`decodeURIComponent(location.pathname) === ${JSON.stringify(apartment)}`, 'tabs preserve apartment SEO URL')
  topic('학교')
  await wait("document.querySelector('#first-grade-title') && location.pathname.includes('/school/')", 'school topic opens assigned school rather than mismatched apartment tab')

  open('/')
  await wait("document.querySelector('input[role=combobox]')", 'home search available')
  run('fill', 'input[role="combobox"]', '은마')
  await wait("[...document.querySelectorAll('#map-search-results [role=option]')].some(x => x.textContent.includes('4,424세대'))", 'existing apartment search reads live household data')
  run('eval', "[...document.querySelectorAll('#map-search-results [role=option]')].find(x => x.textContent.includes('4,424세대')).click(); 'pick'")
  await wait("document.querySelector('#assigned-school-title') && decodeURIComponent(location.pathname) === '/apt/서울-강남구-은마--7A2EMR5J'", 'home search still opens canonical apartment detail')
  open('/scripts/fixtures/map-place.html')
  await wait("document.querySelector('[data-fixture=zero]')", 'development-only component harness loads (not production data)')
  for (const key of ['zero', 'unknown', 'activity']) {
    run('eval', `document.querySelector('[data-fixture=${key}]').click(); 'fixture'`)
    await wait("document.querySelector('[data-testid=map-place-detail]')", `fixture: ${key} common detail sheet opens`)
    check("document.querySelectorAll('[data-testid=bottom-sheet]').length === 1", `fixture: ${key} uses one sheet`)
    if (key !== 'activity') {
      check(`document.querySelector('[data-testid=map-place-detail] dl dd').textContent === ${JSON.stringify(key === 'zero' ? '0명' : '미확인')}`, `fixture: ${key} capacity remains distinct`)
      check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('현재 여석을 뜻하지')", 'fixture: capacity is not vacancy')
    } else {
      check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('QA 영어수학 기관') && document.querySelector('[data-testid=map-place-detail]').textContent.includes('초등학생 대상 강좌와 모집 여부')", 'fixture: institution names and elementary-eligibility caveat render')
    }
    run('eval', "[...document.querySelectorAll('.detail-tabs button')].find(x => x.textContent === '출처·확인').click(); 'source'")
    check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('출처:')", `fixture: ${key} source tab renders`)
    if (key === 'unknown') check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('원천 정보 수정일: 미확인')", 'fixture: unknown source date is not invented')
    run('eval', key === 'unknown' ? "document.querySelector('button[aria-label=\"상세 정보 닫기\"]').click(); 'close'" : "history.back(); 'back'")
    await wait("!document.querySelector('[data-testid=map-place-detail]')", `fixture: ${key} closes by ${key === 'unknown' ? 'button' : 'back'}`)
  }
  process.stdout.write('Focused P1 UI smoke passed. Map SDK/marker gate is separate.\n')
} finally {
  run('close')
}
