import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
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


/**
 * Every absolute address the site publishes must name the same origin.
 *
 * Two deployment units print them: the app build, which stamps index.html and
 * writes robots.txt and the sitemaps from scripts/site-origin.mjs, and the
 * serverless prerender at ../../api/detail.js, which is deployed from the
 * repository root and cannot import that resolver. They read the same variable
 * and carry the same fallback, which is a promise rather than a guarantee - so
 * this compares what they actually serve. A domain move that reaches one of them
 * and not the other publishes 52,000 addresses pointing at the wrong host, and
 * declares a canonical URL on a domain that is no longer the site.
 */
const originOf = (value) => {
  try { return new URL(value).origin } catch { return null }
}

const readTarget = async (filePath) => {
  const response = await fetch(new URL(filePath, baseUrl).toString())
  const body = response.ok ? await response.text() : ''
  if (body.includes('<div id="root">')) {
    // The dev server answers for build-generated files with the SPA fallback.
    const onDisk = path.join(projectRoot, 'dist', filePath.replace(/^\//, ''))
    return fs.existsSync(onDisk) ? { text: fs.readFileSync(onDisk, 'utf8'), from: 'dist/' } : null
  }
  return response.ok ? { text: body, from: 'served' } : null
}

const assertOriginsAgree = async () => {
  const shell = await (await fetch(new URL('/', baseUrl).toString())).text()
  const found = new Map()

  const record = (label, value) => {
    const origin = originOf(value)
    if (origin) found.set(label, origin)
  }

  record('index.html canonical', (shell.match(/<link rel="canonical" href="([^"]*)"/) || [])[1])
  record('index.html og:url', (shell.match(/<meta property="og:url" content="([^"]*)"/) || [])[1])
  record('index.html og:image', (shell.match(/<meta property="og:image" content="([^"]*)"/) || [])[1])

  const robots = await readTarget('/robots.txt')
  if (robots) record(`robots.txt (${robots.from})`, (robots.text.match(/Sitemap:\s*(\S+)/) || [])[1])

  const sitemap = await readTarget('/sitemap-schools-1.xml')
  if (sitemap) record(`sitemap (${sitemap.from})`, (sitemap.text.match(/<loc>([^<]*)<\/loc>/) || [])[1])

  // Only production routes /apt/* through the prerender, so this contributes the
  // function's own origin where there is one and stays quiet where there is not.
  const detail = await fetch(new URL('/apt/7A2EMR5J', baseUrl).toString())
  const detailBody = detail.ok ? await detail.text() : ''
  const prerendered = (detailBody.match(/<meta property="og:url" content="([^"]*)"/) || [])[1]
  // The SPA fallback answers with the shell, whose og:url is the map page. Only
  // a real prerender names the detail address, so that is what distinguishes it -
  // otherwise this reports the shell twice and claims the function was checked.
  if (prerendered && new URL(prerendered).pathname.startsWith('/apt/')) {
    record('prerender og:url', prerendered)
  }

  const origins = [...new Set(found.values())]
  if (found.size < 3) {
    throw new Error(`could not read enough absolute addresses to compare (${found.size})`)
  }
  if (origins.length !== 1) {
    const detail = [...found].map(([label, origin]) => `${label} -> ${origin}`).join('; ')
    throw new Error(`the published absolute addresses name different origins: ${detail}`)
  }
  process.stdout.write(
    `PASS: ${found.size} published addresses all name ${origins[0]}`
    + `${found.has('prerender og:url') ? ', prerender included' : ', prerender not routed here'}
`,
  )
}

// A crawler reads these before it reads a page. They are static files, so a
// deploy that drops them fails quietly: the site looks fine and nothing is
// indexed.
const assertFileServed = async (filePath, mustContain, { built = false } = {}) => {
  const response = await fetch(new URL(filePath, baseUrl).toString())
  const body = response.ok ? await response.text() : ''
  if (response.ok && body.includes(mustContain)) {
    process.stdout.write(`PASS: ${filePath} is served\n`)
    return
  }
  // The sitemaps are written by the build, so a dev server answers for them with
  // the SPA fallback. Checking the file on disk instead keeps the assertion
  // meaningful locally, and naming which copy was checked keeps it honest - a
  // check that can pass without looking at anything is the failure this whole
  // script has been bitten by more than once.
  if (built) {
    const onDisk = path.join(projectRoot, 'dist', filePath.replace(/^\//, ''))
    const text = fs.existsSync(onDisk) ? fs.readFileSync(onDisk, 'utf8') : ''
    if (text.includes(mustContain)) {
      process.stdout.write(`PASS: ${filePath} is not served here, but dist/ holds it\n`)
      return
    }
    throw new Error(
      `${filePath} was neither served (HTTP ${response.status}) nor found in dist/. `
      + 'Run npm run build, which generates it.',
    )
  }
  throw new Error(`${filePath} did not serve as expected (HTTP ${response.status})`)
}

/**
 * The share image has to arrive as an image. A missing file does not fail
 * loudly: the SPA fallback answers 200 with HTML, the og:image tag still points
 * at it, and every KakaoTalk preview shows a broken thumbnail. So this checks
 * the content type and a plausible size, not the status code.
 */
const assertImageServed = async (filePath) => {
  const response = await fetch(new URL(filePath, baseUrl).toString())
  const type = response.headers.get('content-type') || ''
  const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0
  if (!response.ok || !type.startsWith('image/') || bytes < 10_000) {
    throw new Error(`${filePath} is not served as an image (HTTP ${response.status}, ${type || 'no type'}, ${bytes} bytes)`)
  }
  process.stdout.write(`PASS: ${filePath} is served as ${type}, ${Math.round(bytes / 1024)} KB\n`)
}

try {
  await assertDeepLinkResolves('/admin/etl')
  await assertImageServed('/og-image.jpg')
  await assertFileServed('/robots.txt', 'Sitemap:', { built: true })
  await assertFileServed('/sitemap.xml', '<sitemapindex', { built: true })
  await assertFileServed('/sitemap-schools-1.xml', '/school/', { built: true })
  await assertFileServed('/favicon.svg', '<svg')
  await assertOriginsAgree()

  run(['set', 'viewport', '390', '844'])
  // The map lives at /map since the home became its own page (ADR-008). The shell
  // checks below hold for any path, so they run here with the map flow.
  run(['open', new URL('/map', baseUrl).toString()])
  // Matches a version shape rather than a literal one. A pinned version here
  // has to be edited on every release, and an assertion that needs editing to
  // keep passing is one that eventually gets edited without being read.
  // The mount signal is the rendered UI. It used to also require a version in
  // the document title, which is why the version was stuck there: the title is
  // the first line of every search result, and a release number is the least
  // useful thing that could occupy it. The version moved to a meta tag and the
  // freshness check moved with it, so both keep their point.
  await waitFor("document.querySelector('.quick-filter-row')", 'application shell mounted')
  assertPage("/^[0-9]+[.][0-9]+[.][0-9]+$/.test(document.querySelector('meta[name=app-version]')?.content || '')", 'application reports its release version')
  assertPage("!/v[0-9]+[.][0-9]+/.test(document.title)", 'the document title spends no room on a release number')
  assertPage("document.documentElement.scrollWidth === window.innerWidth", '390px layout has no horizontal overflow')

  // The shell's own share metadata. Pasting an address into KakaoTalk shows only
  // what these carry, and the prerender falls back to this shell whenever it
  // cannot reach Supabase - so an empty preview here is an empty preview for
  // every shared link. Asserted on the shell because the dev server has no
  // serverless function to prerender from.
  assertPage(
    "['og:site_name', 'og:title', 'og:description', 'og:url', 'og:type', 'og:image'].every((property) => document.querySelector(`meta[property=\"${property}\"]`)?.content?.trim())",
    'the shell declares the og: tags a shared link previews with',
  )
  // The published regions grew from three to seventeen while this line kept
  // naming three. A stale description is worse than a generic one, because it
  // tells a searcher the answer is not here.
  assertPage(
    "!(document.querySelector('meta[name=description]')?.content || 'unset').startsWith('서울/경기/인천')",
    'the shell description does not name a stale subset of regions',
  )
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

  // A URL nobody can copy is only half a feature, and the button carrying the
  // wrong address would be invisible until someone shared it.
  assertPage(
    "(() => { const button = document.querySelector('[data-testid=share-button]');"
    + " if (!button) return false;"
    + " return decodeURIComponent(button.dataset.shareUrl || '')"
    + ".endsWith('/apt/서울-강남구-은마--7A2EMR5J') })()",
    'the apartment detail offers its canonical URL to share',
  )

  run(['open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', baseUrl).toString()])
  await waitFor(
    "document.body.innerText.includes('서울대현초등학교')",
    'school deep link restored the school it names',
  )
  assertPage(
    "(() => { const button = document.querySelector('[data-testid=share-button]');"
    + " if (!button) return false;"
    + " return decodeURIComponent(button.dataset.shareUrl || '')"
    + ".endsWith('/school/서울-강남구-서울대현초등학교--B000002292') })()",
    'the school detail offers its canonical URL to share',
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

  // The home is the first screen and its top is the assignment search (PRD 6.5).
  // A pick there has to land on the detail address with the map behind it, and
  // the map must not be built for a visitor who never leaves the home.
  run(['open', baseUrl])
  await waitFor("document.querySelector('#home-title') && document.querySelector('input[role=combobox]')", 'home opened with the assignment search on top')
  assertPage("!document.querySelector('.quick-filter-row') && !document.querySelector('[aria-label=\"주변 초등학교 지도\"]')", 'the home does not build the map')
  run(['fill', 'input[role="combobox"]', '은마'])
  await waitFor("[...document.querySelectorAll('#map-search-results [role=option]')].some((node) => node.textContent?.includes('4,424세대'))", 'home search returned the apartment')
  run(['eval', `(() => {
    const result = [...document.querySelectorAll('#map-search-results [role=option]')]
      .find((node) => node.textContent?.includes('4,424세대'))
    result.click()
    return 'apartment selected from home'
  })()`])
  await waitFor(
    "decodeURIComponent(location.pathname) === '/apt/서울-강남구-은마--7A2EMR5J'"
    + " && document.querySelector('[data-testid=bottom-sheet]')?.innerText.includes('배정 학교')",
    'a home search pick moved to the apartment address and opened its detail on the map',
  )
  run(['eval', 'history.back(); "back"'])
  await waitFor("location.pathname === '/' && document.querySelector('#home-title')", 'back from the detail returned to the home')

  // Every screen has an address now; none may exist only as in-memory tab state.
  run(['open', new URL('/favorites', baseUrl).toString()])
  await waitFor("document.querySelector('#favorites-title') && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/favorites'", '/favorites opens the favorites screen')
  run(['open', new URL('/news', baseUrl).toString()])
  await waitFor("document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/news'", '/news opens the news screen')

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
