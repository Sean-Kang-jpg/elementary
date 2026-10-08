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
    // The prerender wraps a shell that may itself name an address - the home, if
    // it falls back to index.html. Two canonicals on one page let a search engine
    // pick either, so the page must carry exactly its own.
    const canonicals = (detailBody.match(/rel="canonical"/g) || []).length
    if (canonicals !== 1) throw new Error(`the prerendered detail page declares ${canonicals} canonical links, not 1`)
    process.stdout.write('PASS: the prerendered detail page declares exactly one canonical\n')

    // A complex registered building by building names its first building as
    // canonical (성호샤인힐즈아파트, 이현로29번길 72-1 ... 72-41). The sitemap lists
    // only that one, so a page pointing at itself here would be an unlisted duplicate.
    const member = await fetch(new URL('/apt/D1YND6ZS', baseUrl).toString())
    const memberBody = member.ok ? await member.text() : ''
    const memberCanonical = (memberBody.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || ''
    if (!memberCanonical.endsWith('--DG8B1CFV')) {
      throw new Error(`a building of a grouped complex declares ${memberCanonical || 'no canonical'}, not its representative`)
    }
    process.stdout.write('PASS: a building of a grouped complex names its representative as canonical\n')
  }

  // The area hubs go through the same function. A visitor reads this markup as
  // it is (AreaPage.tsx), so a hub that falls open to the shell is a blank page.
  const hub = await fetch(new URL('/area/서울/강남구', baseUrl).toString())
  const hubBody = hub.ok ? await hub.text() : ''
  if (hubBody.includes('data-area-page')) {
    const canonicals = (hubBody.match(/rel="canonical"/g) || []).length
    if (canonicals !== 1) throw new Error(`the area hub declares ${canonicals} canonical links, not 1`)
    if (!/<table class="area-table">[\s\S]*href="\/school\//.test(hubBody)) throw new Error('the area hub lists no school links')
    process.stdout.write('PASS: the area hub is prerendered with one canonical and links to its schools\n')
  } else {
    process.stdout.write('SKIP: /area is not routed to the prerender here\n')
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

/**
 * `/` and every other app path are different files since ADR-008 section 3.
 *
 * `/` is the home with its content prerendered for crawlers; the rest rewrite to
 * app.html, the shell with no canonical. A status code cannot tell these apart -
 * during the rollout, /app.html answered 200 from the old deploy's catch-all
 * while the file itself did not exist yet - so these look at what was served.
 */
const assertHomeAndShellSplit = async () => {
  const servedHome = await (await fetch(new URL('/', baseUrl).toString())).text()
  const builtHome = path.join(projectRoot, 'dist', 'index.html')
  const home = servedHome.includes('<!--prerender:home-->')
    ? { text: servedHome, from: 'served' }
    : fs.existsSync(builtHome) ? { text: fs.readFileSync(builtHome, 'utf8'), from: 'dist/' } : null
  if (!home || !home.text.includes('<!--prerender:home-->') || !home.text.includes('id="home-title"')) {
    throw new Error('/ does not carry the prerendered home content')
  }
  if ((home.text.match(/rel="canonical"/g) || []).length !== 1) throw new Error('/ must declare exactly one canonical')
  if (home.text.includes('oapi.map.naver.com')) throw new Error('/ still loads the Naver Maps SDK in its HTML')
  process.stdout.write(`PASS: / carries the prerendered home and one canonical (${home.from})\n`)

  const shell = await (await fetch(new URL(`/app.html?smoke=${Date.now()}`, baseUrl).toString())).text()
  if (/rel="canonical"/.test(shell)) {
    // The dev server answers every path with the source index.html, canonical
    // included. There is no separate shell to check there, and saying so beats
    // passing a check that looked at nothing.
    process.stdout.write('PASS: app paths are not split here (no build served), checked on deploy only\n')
    return
  }
  for (const appPath of ['/map', '/my', '/favorites', '/admin/etl']) {
    const body = await (await fetch(new URL(appPath, baseUrl).toString())).text()
    if (/rel="canonical"/.test(body) || !body.includes('<div id="root"></div>')) {
      throw new Error(`${appPath} is not served the app shell - it names an address or carries prerendered content`)
    }
  }
  process.stdout.write('PASS: /map, /my, /favorites and /admin/etl are served the app shell, not the home\n')

  // Guides and the FAQ are static pages with their own head and content, so a
  // crawler that runs no JavaScript reads them (ADR-008 section 4).
  for (const [pagePath, heading] of [['/guide', 'guides-title'], ['/guide/school-notice', 'guide-title'], ['/faq', 'faq-title'], ['/checklist', 'checklist-title']]) {
    const body = await (await fetch(new URL(pagePath, baseUrl).toString())).text()
    const canonicals = body.match(/<link rel="canonical" href="([^"]*)"/g) || []
    const needsSummary = pagePath.startsWith('/guide/') && !body.includes('class="guide-summary')
    if (needsSummary || canonicals.length !== 1 || !canonicals[0].endsWith(`${pagePath}"`) || !body.includes(`id="${heading}"`)) {
      throw new Error(`${pagePath} is not served as its own static page with one canonical naming it`)
    }
  }
  process.stdout.write('PASS: /guide, a guide, /faq and /checklist are served as static pages with their own canonical\n')
}

try {
  await assertHomeAndShellSplit()
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
  // On a phone 100vh is taller than the visible screen while the address bar shows.
  // A body that centred the app inside min-height: 100vh left bands above and below
  // and let the document scroll the search box under the address bar (2026-10-04).
  // Headless 100vh equals the screen, so check the cause as well as the result.
  assertPage(
    "document.querySelector('#root > div').getBoundingClientRect().top === 0"
    + " && document.documentElement.scrollHeight === window.innerHeight"
    + " && getComputedStyle(document.body).display !== 'flex' && getComputedStyle(document.body).minHeight === '0px'",
    'the app fills the screen from the top and the document does not scroll',
  )

  // The shell's own share metadata. Pasting an address into KakaoTalk shows only
  // what these carry, and the prerender falls back to this shell whenever it
  // cannot reach Supabase - so an empty preview here is an empty preview for
  // every shared link. Asserted on the shell because the dev server has no
  // serverless function to prerender from.
  //
  // og:url is deliberately not required. The shell (app.html, ADR-008 section 3)
  // is served at many addresses, so it cannot name one: when the prerender fails
  // open, a shared detail link would advertise the home. Without og:url a
  // previewer uses the address it fetched. The dev server serves the source
  // index.html, which still has one, so this cannot assert its absence locally.
  assertPage(
    "['og:site_name', 'og:title', 'og:description', 'og:type', 'og:image'].every((property) => document.querySelector(`meta[property=\"${property}\"]`)?.content?.trim())",
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

  // Zoomed out past the districts, the map shows one marker per province. For ten
  // days in production it showed nothing: the markers were fetched but a render
  // guard returned before drawing them, and every check here ran at district zoom.
  // Real wheel and pointer events, because Naver Maps ignores a synthetic click.
  run(['mouse', 'move', '195', '300'], { quiet: true })
  for (let step = 0; step < 6; step += 1) {
    run(['mouse', 'wheel', '300'], { quiet: true })
    await sleep(300)
  }
  await waitFor("document.querySelectorAll('.school-cluster-marker--region').length >= 10 && !document.querySelector('.school-cluster-marker:not(.school-cluster-marker--region)')", 'zooming out replaces the district markers with province markers')
  assertPage("!document.querySelector('[data-testid=map-empty-state]')", 'the zoomed-out map does not claim no school matches')
  const provinceAt = run(['eval', `(() => {
    const visible = [...document.querySelectorAll('.school-cluster-marker--region')]
      .map((node) => node.getBoundingClientRect())
      .find((rect) => rect.top > 140 && rect.bottom < window.innerHeight * 0.6 && rect.left > 0 && rect.right < window.innerWidth)
    if (!visible) throw new Error('No province marker is fully on screen to click')
    return Math.round(visible.left + visible.width / 2) + ' ' + Math.round(visible.top + visible.height / 2)
  })()`], { quiet: true }).replace(/"/g, '').split(' ')
  run(['mouse', 'move', ...provinceAt], { quiet: true })
  run(['mouse', 'down'], { quiet: true })
  run(['mouse', 'up'], { quiet: true })
  // A province click must land on district zoom, not on zoom 10, which is still
  // province mode and only recentres.
  await waitFor("!document.querySelector('.school-cluster-marker--region') && document.querySelectorAll('.school-cluster-marker').length > 0", 'a province marker opens its district markers')

  run(['open', new URL('/map', baseUrl).toString()])
  await waitFor("(window.__ELEMENTARY_PERFORMANCE__ || []).some((metric) => metric.name === 'school-map-load' && metric.status === 'success' && metric.context.resultCount > 0)", 'the map reloads at district zoom for the search flow')

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
  // The sheet opening is not enough: the map has to be at the school. When the
  // SDK moved to load after mount, the map was built at its city-wide default and
  // reported that back over the linked school's viewport - the sheet still opened,
  // so every check above passed, while a shared link showed all of 서울. It only
  // lost the race at desktop width, and the app's own metrics record the zoom it
  // asked for rather than the one drawn, so this reads the map's scale label at
  // 1280px: a school view is in metres, the city-wide default is 5km.
  run(['set', 'viewport', '1280', '800'], { quiet: true })
  run(['open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', baseUrl).toString()])
  await waitFor(
    "(() => { const label = [...document.querySelectorAll('[aria-label=\"주변 초등학교 지도\"] *')].map((node) => node.textContent.trim()).find((text) => /^[0-9]+(m|km)$/.test(text)); return Boolean(label) && !label.endsWith('km') })()",
    'the school link opened the map at the school, not at the city-wide default',
  )
  run(['set', 'viewport', '390', '844'], { quiet: true })
  run(['open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', baseUrl).toString()])
  await waitFor("document.body.innerText.includes('서울대현초등학교')", 'school deep link reopened at mobile width for the checks below')
  assertPage(
    "(() => { const button = document.querySelector('[data-testid=share-button]');"
    + " if (!button) return false;"
    + " return decodeURIComponent(button.dataset.shareUrl || '')"
    + ".endsWith('/school/서울-강남구-서울대현초등학교--B000002292') })()",
    'the school detail offers its canonical URL to share',
  )

  // The start module (PRD v2 W4) is where a parent who searched the school on
  // their notice is handed to the guides, and back has to return them to it.
  assertPage("document.querySelectorAll('.start-module a[href^=\"/guide/\"]').length >= 4", 'the school detail offers the start module with guides for both stages')
  run(['eval', "document.querySelector('.start-module a[href^=\"/guide/\"]').click(); 'start module'"])
  await waitFor("location.pathname.startsWith('/guide/') && document.querySelector('#guide-title')", 'the start module opened a guide')
  run(['eval', 'history.back(); "back"'])
  await waitFor(
    "location.pathname.includes('B000002292') && document.querySelector('[data-testid=bottom-sheet]')?.innerText.includes('서울대현초등학교')",
    'back from the guide returned to the school detail',
  )

  // Care (SQL 23). Both blocks render nothing when their reads fail, so a
  // missing grant or an empty load would pass silently without this.
  await waitFor(
    "document.querySelector('[data-testid=school-care]')?.innerText.includes('오후 돌봄')",
    'the school detail shows its care-classroom disclosure',
  )
  await waitFor("Boolean(document.querySelector('[data-testid=care-centers]'))", 'the school detail lists nearby care centers')
  assertPage("document.querySelector('[data-testid=care-guide-link]')?.getAttribute('href') === '/guide/care-afterschool'", 'the care block links to the care guide')

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
  // The SDK is injected only when a map screen opens (ADR-008 section 5); the
  // home is where most first visits that are not detail pages land.
  assertPage("!document.querySelector('script[src*=oapi]')", 'the home does not load the Naver Maps SDK')
  // The static home is replaced, not doubled, when the app mounts.
  assertPage("document.querySelectorAll('#home-title').length === 1 && !document.documentElement.innerHTML.includes('prerender:home')", 'the app replaced the prerendered home rather than adding to it')
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
  // Save it for MY. Opening it from there must reopen this apartment, not its school.
  run(['eval', "localStorage.removeItem('elementary-favorites-v1'); document.querySelector('[data-testid=bottom-sheet] button[aria-label=\"MY에 저장\"]').click(); 'saved'"])
  run(['eval', 'history.back(); "back"'])
  await waitFor("location.pathname === '/' && document.querySelector('#home-title')", 'back from the detail returned to the home')

  // Every screen has an address now; none may exist only as in-memory tab state.
  // 즐겨찾기 became MY on 2026-10-04; its old address is corrected, not lost.
  run(['open', new URL('/favorites', baseUrl).toString()])
  await waitFor(
    "location.pathname === '/my' && document.querySelector('#my-title') && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/my'",
    'the old /favorites address opens MY at /my with the MY tab active',
  )
  await waitFor("document.querySelectorAll('.my-saved li').length === 1", 'MY lists the apartment saved from its detail')
  run(['eval', "document.querySelector('.my-saved__open').click(); 'open saved'"])
  await waitFor(
    "decodeURIComponent(location.pathname) === '/apt/서울-강남구-은마--7A2EMR5J' && document.querySelector('[data-testid=bottom-sheet]')?.innerText.includes('배정 학교')",
    'a saved apartment opens that apartment, not only its school',
  )
  run(['eval', "localStorage.removeItem('elementary-favorites-v1'); 'cleaned up'"])
  // 학습 준비 became the fourth of five tabs on 2026-10-08. Its timetable entry leads to the map.
  run(['open', new URL('/learn', baseUrl).toString()])
  await waitFor(
    "document.querySelector('#learn-title') && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/learn'",
    '/learn opens 학습 준비 with its tab active',
  )
  assertPage(
    "[...document.querySelectorAll('.app-gnb__item')].map((item) => item.getAttribute('href')).join(' ') === '/ /map /guide /learn /my'",
    'the bottom navigation is 홈, 학교 찾기, 입학 준비, 학습 준비, MY in that order',
  )
  run(['eval', "document.querySelector('.content-page a[href=\"/map\"]').click(); 'to map'"])
  await waitFor("location.pathname === '/map' && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/map'", 'the timetable entry on 학습 준비 opens 학교 찾기')
  run(['open', new URL('/news', baseUrl).toString()])
  // News left the bottom navigation for a link under the guide list; the address stays.
  await waitFor("document.querySelector('#news-title')", '/news opens the news screen')

  // Guides (PRD v2 MVP 1a). A guide is reached from the list, its links move
  // within the app without a reload, and the FAQ answers open in place.
  run(['open', new URL('/guide', baseUrl).toString()])
  await waitFor("document.querySelector('#guides-title') && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/guide'", '/guide lists the guides with the guide tab active')
  assertPage("document.querySelector('.app-gnb__item--active')?.textContent.includes('입학 준비')", 'the tab is named for the hub it opens')
  run(['eval', "window.__smokeNoReload = true; document.querySelector('a.content-list__item[href=\"/guide/school-notice\"]').click(); 'guide'"])
  await waitFor("location.pathname === '/guide/school-notice' && document.querySelector('#guide-title') && document.querySelector('.content-sources')", 'a guide opens with its sources')
  assertPage("document.title.includes('취학통지서') && document.querySelector('link[rel=canonical]')?.href.endsWith('/guide/school-notice')", 'the guide names itself in the title and canonical')
  assertPage("document.querySelectorAll('.guide-summary .guide-summary__item').length >= 2", 'the guide opens with its summary diagram')
  assertPage(
    "(document.querySelector('.content-page__topbar [data-testid=share-button]')?.dataset.shareUrl || '').endsWith('/guide/school-notice')"
    + " && document.querySelector('a.checklist-banner[href=\"/checklist\"]')",
    'the guide offers its own address to share and a way to the checklist',
  )
  run(['eval', "document.querySelector('.content-body a[href=\"/guide/preliminary-call\"]').click(); 'inline link'"])
  await waitFor("location.pathname === '/guide/preliminary-call' && window.__smokeNoReload === true", 'a link inside a guide moved to the next guide without reloading')
  run(['open', new URL('/faq', baseUrl).toString()])
  await waitFor("document.querySelectorAll('details.faq-item').length > 5 && document.querySelector('.app-gnb__item--active')?.getAttribute('href') === '/guide'", '/faq lists its questions under the guide tab')
  assertPage("(document.querySelector('.content-page__titlebar [data-testid=share-button]')?.dataset.shareUrl || '').endsWith('/faq')", 'the FAQ can be shared')
  run(['eval', "document.querySelector('details.faq-item summary').click(); 'opened'"])
  assertPage("document.querySelector('details.faq-item').open && document.querySelector('details.faq-item .content-body').innerText.trim().length > 20", 'an FAQ answer opens in place')
  // The entry year decides which stage leads. 2-3 years out is planning a move;
  // the year of entry is the admission procedure. The family's setup lives in MY
  // (2026-10-04); it folds the picker away once a year is saved and 바꾸기 brings it back.
  run(['open', new URL('/my', baseUrl).toString()])
  await waitFor("document.querySelector('#my-title')", 'MY opens')
  run(['eval', "document.querySelector('.hub-profile__edit')?.click(); 'picker shown'"])
  await waitFor("document.querySelectorAll('.year-chip').length === 3", 'MY offers three entry years')
  run(['eval', "const chip = document.querySelectorAll('.year-chip')[2]; sessionStorage.setItem('smoke-year', chip.querySelector('strong').textContent.slice(0, 4)); chip.click(); 'picked the furthest year'"])
  await waitFor(
    "document.querySelector('.hub-profile')?.textContent.includes(sessionStorage.getItem('smoke-year'))"
    + " && document.querySelector('.roadmap h2')?.textContent.includes('D-')",
    'MY keeps the chosen year and shows the roadmap',
  )
  // 입학 준비 is the public manual: no profile or roadmap, only the stage order and read marks.
  run(['eval', "document.querySelector('.app-gnb__item[href=\"/guide\"]').click(); 'to guides'"])
  await waitFor(
    "location.pathname === '/guide'"
    + " && document.querySelector('.guide-stage')?.classList.contains('guide-stage--planning')"
    + " && document.querySelector('.guide-stage--mine')"
    + " && document.querySelector('.guide-timeline li.is-read a[href=\"/guide/school-notice\"]')",
    'a year two years out puts the planning guides first and the list marks the guides this device has read',
  )
  assertPage("!document.querySelector('.roadmap') && !document.querySelector('.hub-profile')", 'the 입학 준비 list carries no personal setup')
  run(['open', new URL('/guide/no-such-guide', baseUrl).toString()])
  await waitFor("location.pathname === '/guide' && document.querySelector('#guides-title')", 'an unknown guide address falls back to the guide list')

  // MVP 1b. The roadmap follows the profile: private-school steps appear only for
  // a family that says it is considering one, in the months they apply to.
  run(['open', baseUrl])
  await waitFor("document.querySelectorAll('.year-chip').length === 3", 'the home offers the entry years')
  run(['eval', "document.querySelectorAll('.year-chip')[0].click(); 'nearest year'"])
  await waitFor(
    "document.querySelector('.roadmap-summary h2')?.textContent.includes('D-') && document.querySelector('.roadmap-summary__more')?.getAttribute('href') === '/my'",
    'picking a year on the home shows the days left and a way to the full roadmap',
  )
  assertPage("!document.querySelector('.roadmap .pref-chip') && !document.querySelector('.guide-stage')", 'the home keeps the full roadmap in MY and the guides under 입학 준비')
  run(['eval', "document.querySelector('.roadmap-summary__more').click(); 'to the hub'"])
  await waitFor("location.pathname === '/my' && document.querySelectorAll('.roadmap .pref-chip').length >= 2", 'the summary opens the roadmap in MY')
  run(['eval', "document.querySelectorAll('.roadmap .pref-chip')[1].click(); 'private interest on'"])
  await waitFor(
    "(() => { const month = new Date().getMonth() + 1; const privateMonths = [9, 10, 11];"
    + " const hasPrivate = Boolean(document.querySelector('.roadmap__tasks a[href=\"/guide/private-national\"]'));"
    + " return privateMonths.includes(month) ? hasPrivate : true })()",
    'choosing private schools adds their steps in the months they apply to',
  )

  // The checklist keeps its state on this device across a reload.
  run(['open', new URL('/checklist', baseUrl).toString()])
  await waitFor("document.querySelectorAll('.checklist-rows input[type=checkbox]').length >= 10 && document.querySelectorAll('.checklist-tile').length >= 5", '/checklist lists its items')
  assertPage("(document.querySelector('.content-page__titlebar [data-testid=share-button]')?.dataset.shareUrl || '').endsWith('/checklist')", 'the checklist can be shared by its address')
  run(['eval', "document.querySelector('.checklist-rows input[type=checkbox]').click(); 'checked'"])
  run(['open', new URL('/checklist', baseUrl).toString()])
  await waitFor(
    "document.querySelector('.checklist-rows input[type=checkbox]')?.checked === true && document.querySelector('.checklist-hero__count b')?.textContent === '1'",
    'a checked item survives a reload',
  )
  run(['eval', "document.querySelector('.checklist-rows input[type=checkbox]').click(); localStorage.removeItem('wherecho:profile-v1'); localStorage.removeItem('wherecho:read-guides-v1'); 'cleaned up'"])

  // This script runs against production after every release. If its headless
  // browser were measured, each release would add sessions that did nothing and
  // skew every rate in MEASUREMENT_PLAN. analytics.ts skips automated browsers.
  assertPage("!document.querySelector('script[src*=googletagmanager]') && typeof window.gtag === 'undefined'", 'the smoke browser is not measured by GA4')

  // GA4 sends visit data to Google, so the notice has to ship with it, complete.
  // privacy.json holds the values only the operator can give; a release that
  // still shows 미정 in the policy is a release that measures without notice.
  run(['open', new URL('/privacy', baseUrl).toString()])
  await waitFor("document.querySelector('#privacy-title')", '/privacy opens the privacy policy')
  assertPage("!document.querySelector('.privacy-page__inner').innerText.includes('미정')", 'the privacy policy has every operator value filled in')

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
