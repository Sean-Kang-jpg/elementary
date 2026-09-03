import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(projectRoot, 'node_modules', 'agent-browser', 'bin', 'agent-browser.js')
const baseUrl = process.argv[2] || 'http://127.0.0.1:3001'
const session = `elementary-public-smoke-${process.pid}`
const namespace = 'elementary-smoke'

const run = (args, { quiet = false } = {}) => {
  const result = spawnSync(process.execPath, [cli, '--namespace', namespace, '--session', session, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 45_000,
  })
  if (!quiet && result.stdout.trim()) process.stdout.write(`${result.stdout.trim()}\n`)
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `agent-browser ${args[0]} failed`)
  }
  return result.stdout.trim()
}

const assertPage = (condition, message) => run([
  'eval',
  `(() => { if (!(${condition})) throw new Error(${JSON.stringify(message)}); return ${JSON.stringify(`PASS: ${message}`)} })()`,
])

const swipeSheet = (startY, endY, scrollTop = null) => run(['eval', `(() => {
  const element = document.querySelector('[data-testid="bottom-sheet-scroll"]')
  if (!element) throw new Error('Bottom sheet scroll surface not found')
  ${scrollTop === null ? '' : `element.scrollTop = ${scrollTop}`}
  const touch = (y) => new Touch({
    identifier: 1,
    target: element,
    clientX: Math.round(window.innerWidth / 2),
    clientY: y,
  })
  element.dispatchEvent(new TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [touch(${startY})],
    changedTouches: [touch(${startY})],
  }))
  element.dispatchEvent(new TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [touch(${endY})],
    changedTouches: [touch(${endY})],
  }))
  element.dispatchEvent(new TouchEvent('touchend', {
    bubbles: true,
    cancelable: true,
    touches: [],
    changedTouches: [touch(${endY})],
  }))
  return 'sheet swiped'
})()`])

try {
  run(['set', 'viewport', '390', '844'])
  run(['open', baseUrl])
  run(['wait', '2500'])
  assertPage("document.title.includes('v2.2')", 'v2.2 application loaded')
  assertPage("document.documentElement.scrollWidth === window.innerWidth", '390px layout has no horizontal overflow')
  assertPage("(window.__ELEMENTARY_PERFORMANCE__ || []).some((metric) => metric.name === 'school-map-load' && metric.status === 'success' && metric.context.resultCount > 0)", 'district data loaded and measured')

  run(['eval', `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === '학생 수')
    if (!button) throw new Error('Student quick filter not found')
    button.click()
    return 'student filter opened'
  })()`])
  run(['eval', `(() => {
    const option = [...document.querySelectorAll('[role="menuitemradio"]')]
      .find((node) => node.textContent?.trim() === '80명 이상')
    if (!option) throw new Error('80 student option not found')
    option.click()
    return 'student filter applied'
  })()`])
  run(['wait', '900'])
  assertPage("[...document.querySelectorAll('button')].some((node) => node.textContent?.trim() === '80명+')", 'quick filter applied')
  run(['eval', `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === '80명+')
    button.click()
    return 'student filter reopened'
  })()`])
  run(['wait', '100'])
  run(['eval', `(() => {
    const option = [...document.querySelectorAll('[role="menuitemradio"]')]
      .find((node) => node.textContent?.trim() === '제한 없음')
    if (!option) throw new Error('Unlimited student option not found')
    option.click()
    return 'student filter reset'
  })()`])
  run(['wait', '900'])

  run(['fill', 'input[role="combobox"]', '서울방현'])
  run(['wait', '900'])
  assertPage("document.querySelectorAll('#school-search-results button').length > 0", 'school search returned results')
  run(['eval', "document.querySelector('#school-search-results button').click(); 'school selected'"])
  run(['wait', '2500'])
  assertPage("document.body.innerText.includes('서울방현초등학교')", 'school detail rendered')
  assertPage("(window.__ELEMENTARY_PERFORMANCE__ || []).some((metric) => metric.name === 'school-apartment-load' && metric.status === 'success' && metric.context.resultCount > 0)", 'assigned apartments loaded and measured')
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '0'", 'school sheet opened at its default snap')

  swipeSheet(650, 470)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '1'", 'content swipe expanded the sheet to its middle snap')
  swipeSheet(650, 450)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '2'", 'content swipe expanded the sheet to its 88% snap')
  swipeSheet(400, 570, 100)
  run(['wait', '100'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '2'", 'scrolled content retained control of a downward swipe')
  swipeSheet(400, 570, 0)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '1'", 'top-edge downward swipe collapsed the sheet one snap')

  const interactionErrors = JSON.parse(run(['--json', 'errors', '--clear'], { quiet: true }))
  const unexpectedErrors = interactionErrors.data.errors.filter((error) => (
    !error.text.includes("Cannot read properties of null (reading 'LatLng')")
  ))
  if (unexpectedErrors.length > 0) {
    throw new Error(`Page errors detected: ${JSON.stringify(unexpectedErrors)}`)
  }
  process.stdout.write('PASS: no unexpected page errors during the primary user flow\n')
  if (interactionErrors.data.errors.length > 0) {
    process.stdout.write(`INFO: ignored ${interactionErrors.data.errors.length} known Naver Maps headless LatLng errors\n`)
  }

  for (const [width, height] of [[360, 800], [430, 932], [1280, 800]]) {
    run(['set', 'viewport', String(width), String(height)], { quiet: true })
    assertPage("document.documentElement.scrollWidth === window.innerWidth", `${width}px layout has no horizontal overflow`)
  }

  assertPage("(window.__ELEMENTARY_PERFORMANCE__ || []).filter((metric) => metric.name === 'school-map-load' && metric.status === 'success').every((metric) => metric.durationMs < 5000)", 'map requests stayed within the 5s smoke budget')
  assertPage("(window.__ELEMENTARY_PERFORMANCE__ || []).filter((metric) => metric.name === 'school-apartment-load' && metric.status === 'success').every((metric) => metric.durationMs < 3000)", 'apartment requests stayed within the 3s smoke budget')

  const metrics = run(['eval', 'JSON.stringify(window.__ELEMENTARY_PERFORMANCE__ || [])'], { quiet: true })
  process.stdout.write(`Performance metrics: ${metrics}\n`)
  process.stdout.write('Public map smoke test passed.\n')
} finally {
  spawnSync(process.execPath, [cli, '--namespace', namespace, '--session', session, 'close'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })
}
