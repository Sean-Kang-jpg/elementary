// Uses public data and an isolated browser context. No fixtures or database writes.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (base !== 'https://wherecho.co.kr') throw new Error('Pass the production origin explicitly.')
config({ path: path.join(root, '.env'), quiet: true })
const endpoint = new URL('/rest/v1/school_care_hours', process.env.VITE_SUPABASE_URL)
endpoint.searchParams.set('select', 'school_id,morning_hours,source_year')
endpoint.searchParams.set('morning_hours', 'not.is.null')
endpoint.searchParams.set('limit', '100')
endpoint.searchParams.set('order', 'school_id')
const response = await fetch(endpoint, { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY } })
assert.ok(response.ok, `Public care query returned ${response.status}`)
const samples = await response.json()
const sample = samples.find(row => /^\d{2}:\d{2}\s*[-~～–]\s*\d{2}:\d{2}$/.test(row.morning_hours))
assert.ok(sample, 'No public morning-hours sample')
const [start, end] = sample.morning_hours.split(/\s*[-~～–]\s*/)
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
assert.ok(minutes(start) < minutes(end) && minutes(end) <= 720)
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
try {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/timetable?school=${sample.school_id}`)
  const panel = page.locator('[data-testid=school-morning-care]')
  await panel.getByText('운영시간 기재', { exact: true }).waitFor()
  assert.match(await panel.textContent(), /등교시각미확인/)
  assert.ok((await panel.textContent()).includes(`${sample.source_year}학년도`))
  assert.ok((await panel.textContent()).includes(`${start} ~ ${end}`))
  await page.getByRole('button', { name: '시간표 초안 만들기', exact: true }).click()
  const choice = page.locator('.my-add-card [data-testid=morning-care-choice]')
  for (const day of ['월', '수']) {
    await page.locator('.my-week-nav').getByRole('button', { name: `${day}요일`, exact: true }).click()
    await page.locator('.my-agenda__add').click()
    await choice.getByRole('button').click()
    await page.keyboard.press('Escape')
  }
  const readMorning = () => page.evaluate(id => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.find(p => p.schoolId === id).entries.find(e => e.id === `care-${id}-morning`), sample.school_id)
  const entry = await readMorning()
  assert.deepEqual([entry.weekdays, entry.start, entry.end, entry.participation], [[1, 3], minutes(start), minutes(end), 'planned'])
  assert.match(entry.source.ref, /^school_care_hours:/)
  await page.reload()
  await page.locator('.my-week-nav').getByRole('button', { name: '월요일', exact: true }).click()
  await page.locator('.my-agenda__add').click()
  assert.equal(await choice.getByRole('button').getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Escape')
  assert.deepEqual(await readMorning(), entry)
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.goto(`${base}/my`)
  await page.locator(`.my-timetable-summary a[href="/timetable?school=${sample.school_id}"]`).waitFor()
  await page.goto(`${base}/school/sample--${sample.school_id}`)
  await page.locator('[aria-label="학교 상세 메뉴"]').getByRole('button', { name: '방과후·돌봄', exact: true }).click()
  await panel.getByText('운영시간 기재', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => !document.querySelector('script[src*=googletagmanager]') && typeof window.gtag === 'undefined'), true)
  console.log(JSON.stringify({ school: sample.school_id, sourceYear: sample.source_year, publicPanel: 'PASS', selectedWeekdays: [1, 3], persistence: 'PASS', mySummary: 'PASS', schoolDetail: 'PASS', widths: [360, 390, 1280], browserErrors: 0 }))
} finally { await context.close(); await browser.close() }
