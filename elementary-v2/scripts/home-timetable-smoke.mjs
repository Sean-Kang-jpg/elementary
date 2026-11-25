import path from 'node:path'

export async function smokeHomeTimetable({ baseUrl, projectRoot, run, waitFor, assertPage }) {
  const base = new URL(baseUrl)
  if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['3000', '3001'].includes(base.port)) {
    throw new Error('Home timetable smoke uses localhost:3000 or localhost:3001')
  }
  const fixture = path.join(projectRoot, 'scripts/fixtures/tt01-network.js')
  const quiet = { quiet: true }
  const open = (target) => run(['open', new URL(target, base).href, '--init-script', fixture], quiet)
  const click = (selector) => run(['click', selector], quiet)
  const named = (role, name) => run(['find', 'role', role, 'click', '--name', name, '--exact'], quiet)
  const view = (face) => `document.querySelector('.plan-faces [aria-current=page]')?.getAttribute('href') === '/timetable?face=${face}'`
  const stored = "JSON.parse(localStorage.getItem('elementary-schedule-plans-v1') || '{\"plans\":[]}').plans"
  const home = '.app-topbar__home'
  const inViewport = `(() => {
    const links = [...document.querySelectorAll('.home-hero__actions a')]
    const bottom = document.querySelector('.app-gnb').getBoundingClientRect().top
    return innerWidth === 390 && innerHeight === 844 && document.documentElement.scrollWidth === innerWidth &&
      links.length === 2 && links.every(link => {
        const { top, left, right, bottom: edge } = link.getBoundingClientRect()
        return top >= 0 && edge <= bottom && left >= 0 && right <= innerWidth
      })
  })()`

  open('/')
  run(['set', 'device', 'iPhone 13'], quiet)
  await waitFor("document.querySelector('.home-hero__actions')", 'home mounted')
  assertPage(inViewport, 'both CTAs fit the first 390×844 mobile screen')
  assertPage("document.querySelector('#home-title').textContent === '초등 입학 준비, 우리 아이의 하루부터' && document.querySelector('.home-page__lead').textContent === '하교 뒤 돌봄·방과후·픽업을 우리 집 일정에 맞춰보세요'", 'home uses the approved title and lead')
  assertPage("document.querySelectorAll('.worry-item').length === 1 && !document.querySelector('.plan-summary')", 'home shows a single seasonal card')
  await waitFor("document.querySelectorAll('#home-showcase-title').length === 1 && document.querySelectorAll('.showcase-card').length === 1 && document.querySelector('.showcase-card .showcase-bars li')", 'home shows one real-school example when the build snapshot is served')

  named('link', '하교 후 일정 짜기')
  await waitFor(view('week'), 'home primary CTA opens the weekly timetable')
  assertPage("location.search === '?face=week' && !location.search.includes('school=')", 'home opens the week without a school')
  named('button', '학교 없이 시작')
  named('button', '+ 일정 추가')
  click('.my-calendar-form button[type="submit"]')
  await waitFor(`${stored}.find(plan => plan.schoolId === 'no-school')?.entries[0]?.label === '픽업'`, 'first pickup saves without school selection')
  assertPage("(window.__ANALYTICS_LOG__ || []).filter(event => event.event === 'timetable_draft_create').length === 1 && (window.__ANALYTICS_LOG__ || []).some(event => event.event === 'home_shelf_click' && event.params.item === 'timetable')", 'client debug records the home click and a single draft create')
  assertPage("!performance.getEntriesByType('resource').some(entry => /\/rest\/v1\/school_afterschool/.test(entry.name))", 'manual path does not request school courses')

  click('.timetable-pick a[href="/map"]')
  await waitFor("location.pathname === '/map' && document.querySelector('input[role=combobox]')", 'school import links to existing assignment search')
  click(home)
  named('link', '배정 학교 찾기')
  await waitFor("location.pathname === '/map' && document.querySelector('input[role=combobox]')", 'home secondary CTA opens the same assignment search')

  click(home)
  named('link', '입학 준비 가이드')
  await waitFor("location.pathname === '/guide' && document.querySelector('.guide-stage')", 'home guide link opens admission guides')
  click('.app-gnb a[href="/timetable"]')
  await waitFor(view('week'), '우리집 일정 GNB opens the weekly timetable by default')
  await waitFor("document.querySelector('.my-agenda__card--personal')?.textContent.includes('픽업')", 'weekly entry restores the saved pickup')
  named('link', '입학까지')
  await waitFor(`${view('timeline')} && document.querySelector('.my-preparation')`, '입학까지 tab opens the admission timeline')

  open('/timetable?face=timeline')
  await waitFor(`${view('timeline')} && document.querySelector('.my-preparation')`, 'direct admission timeline link remains valid')
  click('.app-gnb a[href="/guide"]')
  await waitFor("location.pathname === '/guide' && document.querySelector('.guide-stage')", '입학 준비 GNB opens admission guides')
}
