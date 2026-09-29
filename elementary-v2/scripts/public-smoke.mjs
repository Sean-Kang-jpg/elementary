import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(projectRoot, 'node_modules', 'agent-browser', 'bin', 'agent-browser.js')
const baseUrl = process.argv[2] || 'http://127.0.0.1:3001'
const session = `elementary-public-smoke-${process.pid}`
const namespace = 'elementary-smoke'
const connectionArgs = process.env.AGENT_BROWSER_CDP_PORT
  ? ['--cdp', process.env.AGENT_BROWSER_CDP_PORT]
  : []

const run = (args, { quiet = false } = {}) => {
  const result = spawnSync(process.execPath, [cli, '--namespace', namespace, '--session', session, ...connectionArgs, ...args], {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A fixed `wait` is long enough on localhost and sometimes short over the
// network, which makes a run fail and then pass with nothing changed. A flaky
// gate is worse than a slow one: the habit it teaches is to re-run, and a real
// regression then reads as noise. So anything that waits on data polls for the
// condition instead, and only fails once it truly has not arrived.
const waitFor = async (condition, message, { timeoutMs = 15_000, intervalMs = 250 } = {}) => {
  const deadline = Date.now() + timeoutMs
  let checks = 0
  for (;;) {
    checks += 1
    const probe = run(
      ['eval', `(() => { try { return (${condition}) ? 'READY' : 'WAITING' } catch { return 'WAITING' } })()`],
      { quiet: true },
    )
    if (probe.includes('READY')) {
      process.stdout.write(`PASS: ${message} (${checks} check${checks === 1 ? '' : 's'})
`)
      return
    }
    if (Date.now() >= deadline) {
      throw new Error(`${message} — still not true after ${timeoutMs}ms and ${checks} checks`)
    }
    await sleep(intervalMs)
  }
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

// I-27: a deployment without an SPA rewrite serves `/` correctly and 404s
// every other path, so opening only the base URL cannot see the failure.
// Vite's dev server falls back to index.html, so this passes locally and only
// fails where it matters: a deployed target that lost its rewrite rule.
const assertDeepLinkResolves = async (deepPath) => {
  const target = new URL(deepPath, baseUrl).toString()
  const response = await fetch(target, { redirect: 'follow' })
  const body = response.ok ? await response.text() : ''
  if (!response.ok || !body.includes('<div id="root">')) {
    throw new Error(
      `Deep link ${deepPath} did not resolve to the application shell `
      + `(HTTP ${response.status}). The SPA rewrite is missing from the deployed configuration.`,
    )
  }
  process.stdout.write(`PASS: deep link ${deepPath} resolves to the application shell\n`)
}

try {
  await assertDeepLinkResolves('/admin/etl')

  run(['set', 'viewport', '390', '844'])
  run(['open', baseUrl])
  // Matches a version shape rather than a literal one. A pinned version here
  // has to be edited on every release, and an assertion that needs editing to
  // keep passing is one that eventually gets edited without being read.
  await waitFor("/v[0-9]+[.][0-9]+/.test(document.title) && document.querySelector('.quick-filter-row')", 'application shell mounted')
  assertPage("/v[0-9]+[.][0-9]+/.test(document.title)", 'application reports a version in its title')
  assertPage("document.documentElement.scrollWidth === window.innerWidth", '390px layout has no horizontal overflow')
  assertPage("document.querySelector('.quick-filter-row')?.textContent?.includes('학교') && document.querySelector('.quick-filter-row')?.textContent?.includes('아파트')", 'quick filters disclose school and apartment scope')
  await waitFor("(window.__ELEMENTARY_PERFORMANCE__ || []).some((metric) => metric.name === 'school-map-load' && metric.status === 'success' && metric.context.resultCount > 0)", 'district data loaded and measured')

  run(['fill', 'input[role="combobox"]', '은마'])
  await waitFor("[...document.querySelectorAll('#map-search-results [role=option]')].some((node) => node.textContent?.includes('4,424세대'))", 'apartment search returned household data')
  // Keyed on name plus address, not name alone: 은마 exists in both 서울 and 대구,
  // so two distinct complexes legitimately share a name once a region is promoted.
  assertPage("[...document.querySelectorAll('#map-search-results [role=option]')].filter((node) => node.textContent?.includes('은마')).length === new Set([...document.querySelectorAll('#map-search-results [role=option]')].filter((node) => node.textContent?.includes('은마')).map((node) => [...node.querySelectorAll('span > span')].slice(0, 2).map((part) => part.textContent).join('|'))).size", 'apartment search results are deduplicated')
  run(['eval', `(() => {
    const result = [...document.querySelectorAll('#map-search-results [role=option]')]
      .find((node) => node.textContent?.includes('4,424세대'))
    if (!result) throw new Error('Apartment search result not found')
    result.click()
    return 'apartment selected'
  })()`])
  // Checks the flow reached the apartment detail, not merely that some sheet
  // opened. The previous version asserted '총 세대수', '동 수' and '배정학교:',
  // labels removed back in 1960fef, so it failed before reaching anything real
  // and hid a regression that had disabled assigned-apartment browsing outright.
  await waitFor(
    "(() => { const sheet = document.querySelector('[data-testid=bottom-sheet]');"
    + " if (!sheet) return false; const text = sheet.innerText;"
    + " return text.includes('개 동') && text.includes('세대당 주차') && text.includes('배정 학교') })()",
    'apartment search opened the apartment detail with building count, parking and its assigned school',
  )
  run(['eval', `(() => {
    const close = document.querySelector('button[aria-label="상세 정보 닫기"]')
    if (!close) throw new Error('Apartment detail close button not found')
    close.click()
    return 'apartment detail closed'
  })()`])
  run(['wait', '300'])

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
  await waitFor("[...document.querySelectorAll('button')].some((node) => node.textContent?.trim() === '80명+')", 'quick filter applied')
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
  // Resetting the filter reissues the map query, so wait for the control to
  // return to its unfiltered label rather than guessing how long that takes.
  await waitFor("[...document.querySelectorAll('button')].some((node) => node.textContent?.trim() === '학생 수')", 'student filter reset to unrestricted')

  // A shared link has to land on the thing it names, and the decorative part of
  // the path has to be corrected rather than trusted. Both are what the whole
  // slug design exists for, so neither should be able to break unnoticed.
  run(['open', new URL('/apt/아무렇게나써도--7A2EMR5J', baseUrl).toString()])
  await waitFor(
    "(() => { const sheet = document.querySelector('[data-testid=bottom-sheet]');"
    + " return !!sheet && sheet.innerText.includes('은마') && sheet.innerText.includes('개 동') })()",
    'apartment deep link restored the complex it names',
  )
  assertPage(
    "decodeURIComponent(location.pathname) === '/apt/서울-강남구-은마--7A2EMR5J'",
    'a non-canonical decorative prefix was rewritten to the canonical path',
  )
  assertPage(
    "decodeURIComponent(document.querySelector('link[rel=canonical]')?.href || '')"
    + ".endsWith('/apt/서울-강남구-은마--7A2EMR5J')",
    'the page declares its canonical URL',
  )

  run(['open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', baseUrl).toString()])
  await waitFor(
    "document.body.innerText.includes('서울대현초등학교')",
    'school deep link restored the school it names',
  )

  run(['fill', 'input[role="combobox"]', '서울방현'])
  await waitFor("document.querySelectorAll('#map-search-results [role=option]').length > 0", 'school search returned results')
  run(['eval', "document.querySelector('#map-search-results [role=option]').click(); 'school selected'"])
  await waitFor("document.body.innerText.includes('서울방현초등학교')", 'school detail rendered')
  await waitFor("(window.__ELEMENTARY_PERFORMANCE__ || []).some((metric) => metric.name === 'school-apartment-load' && metric.status === 'success' && metric.context.resultCount > 0)", 'assigned apartments loaded and measured')
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '1'", 'school sheet opened at its default detail snap')

  swipeSheet(650, 470)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '2'", 'content swipe expanded the sheet to its middle snap')
  swipeSheet(650, 450)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '3'", 'content swipe expanded the sheet to its 88% snap')
  swipeSheet(400, 570, 100)
  run(['wait', '100'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '3'", 'scrolled content retained control of a downward swipe')
  swipeSheet(400, 570, 0)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '2'", 'top-edge downward swipe collapsed the sheet one snap')
  swipeSheet(400, 570, 0)
  run(['wait', '400'])
  swipeSheet(400, 570, 0)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '0'", 'detail sheet minimized to its title-only snap')
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.innerText.includes('서울방현초등학교')", 'selected school remained visible after minimizing')
  assertPage("!document.querySelector('[aria-labelledby=first-grade-title]')", 'detail content was hidden at the minimum snap')
  swipeSheet(400, 570, 0)
  run(['wait', '400'])
  assertPage("document.querySelector('[data-testid=bottom-sheet]')?.dataset.snapIndex === '0'", 'downward swipe at minimum did not exit to the neighborhood')

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
  spawnSync(process.execPath, [cli, '--namespace', namespace, '--session', session, ...connectionArgs, 'close'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })
}
