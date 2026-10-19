// Local-only delayed responses verify search races without writing school data.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
try {
  const page = await context.newPage()
  const errors = []
  const pending = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/rest/v1/school_master?*', async route => {
    const url = new URL(route.request().url())
    if (!url.searchParams.get('school_name')?.startsWith('ilike.')) return route.continue()
    pending.push(route)
  })
  const waitRequest = async count => {
    const end = Date.now() + 10000
    while (pending.length < count) {
      if (Date.now() > end) throw new Error(`Search request ${count} did not arrive`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  const reply = (index, name) => pending[index].fulfill({
    json: [{ school_id: 'B000002292', school_name: name, road_address: '서울특별시 강남구 QA', region: '서울특별시' }],
  })
  await page.goto(new URL('/timetable', base).href)
  const input = page.getByRole('searchbox', { name: '초등학교 이름' })
  const results = page.locator('.timetable-search__results')
  await input.fill('대현')
  await waitRequest(1)
  await input.fill('역삼')
  await waitRequest(2)
  await reply(1, 'QA 역삼초등학교')
  await results.getByRole('button', { name: /QA 역삼/ }).waitFor()
  await input.fill('대현')
  await waitRequest(3)
  assert.equal(await results.getByRole('button').count(), 0)
  assert.match(await results.textContent(), /찾는 중/)
  console.log('PASS: changing the query clears the previous selectable results')
  const staleResponse = page.waitForResponse(response => response.url() === pending[0].request().url())
  await reply(0, 'QA 이전 대현초등학교')
  await staleResponse
  // Give the stale fetch promise and React commit a turn before asserting it was ignored.
  await page.waitForTimeout(100)
  assert.equal(await results.getByRole('button').count(), 0)
  await reply(2, 'QA 최신 대현초등학교')
  await results.getByRole('button', { name: /QA 최신 대현/ }).waitFor()
  assert.equal(await results.getByRole('button').count(), 1)
  console.log('PASS: returning to the same query cannot revive an older request')
  await input.fill('대')
  await results.waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  console.log('PASS: short queries hide results and no browser runtime errors occur')
} finally { await context.close(); await browser.close() }
