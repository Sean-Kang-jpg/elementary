// Production rendering check with an isolated browser's draft; no API mocks or DB writes.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const base = process.argv[2]
if (!base || new URL(base).origin !== 'https://wherecho.co.kr') throw new Error('Pass the authorized production URL.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
try {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/timetable', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('#timetable-title').waitFor()
  await page.evaluate(() => {
    const entry = (id, kind, label, start, end, extra = {}) => ({ id, kind, label, weekdays: [1], start, end, evidence: 'unknown', participation: 'planned', ...extra })
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{
      schoolId: 'B000002292', schoolName: '운영 배포 확인용 계획', entryYear: null, updatedAt: '2026-10-20', entries: [
        entry('check-school', 'school', '정규수업', null, 780, { participation: 'confirmed', evidence: 'estimated' }),
        entry('check-morning', 'care', '아침 돌봄', null, null),
        entry('check-afternoon', 'care', '오후 돌봄', null, null, { startsAfterSchool: true }),
        entry('check-course', 'afterschool', '확인용 방과후', 840, 900),
        entry('check-evening', 'care', '저녁·연장 돌봄', 1020, 1140),
      ],
    }] }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-entry-id=check-morning]').waitFor()
  const before = await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1'))
  assert.match(await page.locator('[data-entry-id=check-morning]').textContent(), /08:00.*09:00.*기본 가정/)
  assert.match(await page.locator('[data-entry-id=check-afternoon]').textContent(), /13:00.*17:00.*기본 가정/)
  assert.match(await page.locator('.my-agenda__notes').textContent(), /15:00–17:00/)
  assert.deepEqual(await page.locator('.my-agenda__row').evaluateAll(nodes => nodes.map(node => node.dataset.entryId)), ['check-morning', 'check-school', 'check-afternoon', 'check-course', 'check-evening'])
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  assert.equal(await page.locator('[data-band=morning][data-start="480"][data-end="540"]').count(), 1)
  assert.equal(await page.locator('.my-week__entry[data-start="780"][data-end="1020"]').count(), 1)
  assert.equal(await page.locator('.my-week__unplaced').count(), 0)
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1')), before)
  assert.deepEqual(errors, [])
  console.log('PASS: production care defaults, day order, course return, evening continuation, week placement, 360/390/1280px, no draft mutation or page errors')
} finally { await context.close(); await browser.close() }
