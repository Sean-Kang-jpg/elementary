import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
try {
  for (const mode of ['unknown', 'missing']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
    await context.addInitScript({ path: path.join(root, 'scripts/fixtures/my-schedule-network.js') })
    await context.addInitScript((mode) => {
      const original = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url)
        if (url.pathname.endsWith('/school_care_hours') && url.searchParams.get('school_id') === 'eq.qa-schedule') {
          return new Response(JSON.stringify(mode === 'missing' ? null : {
            school_id: 'qa-schedule', source_year: 2026, status: 'school_check_needed', afternoon_end: null,
            extended_end: null, extended_condition: null, morning_hours: null, grades: null, source: 'QA 시간 미확인',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return original(...args)
      }
    }, mode)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(new URL('/timetable', base).href, { waitUntil: 'domcontentloaded' })
    await page.locator('#timetable-title').waitFor()
    await page.evaluate(() => {
      localStorage.setItem('elementary-favorites-v1', JSON.stringify([{ kind: 'school', id: 'qa-schedule', name: '시간 미확인 돌봄 QA', address: 'QA', latitude: 0, longitude: 0 }]))
      localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{ schoolId: 'qa-schedule', schoolName: '시간 미확인 돌봄 QA', entryYear: null, updatedAt: '2026-10-20', entries: [{ id: 'school', kind: 'school', label: '정규수업', weekdays: [1,2,3,4,5], start: null, end: 780, evidence: 'estimated', participation: 'confirmed' }] }] }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.my-agenda__add').click()
    const card = page.locator('.my-add-card')
    await card.locator('.my-course-picker[aria-busy=false]').waitFor()
    await card.locator('[data-testid=morning-care-choice] button').click()
    await card.locator('.my-course-choice--care').filter({ hasText: '돌봄 · 오후' }).click()
    await card.locator('[data-program-label="QA 미술 · A"]').click()
    assert.match(await page.locator('[data-entry-id="care-qa-schedule-morning"]').textContent(), /08:00.*09:00.*기본 가정/)
    assert.match(await page.locator('[data-entry-id="care-qa-schedule-afternoon"]').textContent(), /13:00.*17:00.*기본 가정/)
    assert.match(await page.locator('.my-agenda__notes').textContent(), /15:00–17:00/)
    await card.locator('.my-course-choice--care').filter({ hasText: '저녁·연장' }).click()
    const form = card.locator('.my-calendar-form')
    assert.equal(await form.getByLabel('일정 이름', { exact: true }).inputValue(), '저녁·연장 돌봄')
    assert.equal(await form.getByLabel('시작', { exact: true }).inputValue(), '17:00')
    assert.equal(await form.getByLabel('종료', { exact: true }).inputValue(), '')
    await form.getByLabel('종료', { exact: true }).fill('19:00')
    await form.getByRole('button', { name: '저장', exact: true }).click()
    await page.locator('[data-entry-id="care-qa-schedule-extended"]').waitFor()
    assert.match(await page.locator('[data-entry-id="care-qa-schedule-extended"]').textContent(), /17:00.*19:00/)
    assert.deepEqual(await page.locator('.my-agenda__row').evaluateAll(nodes => nodes.map(node => node.dataset.section)), ['morning', 'school', 'afternoon', 'afternoon', 'afternoon'])
    await page.getByRole('button', { name: '주간 편집', exact: true }).click()
    assert.equal(await page.locator('[data-band=morning][data-start="480"][data-end="540"]').count(), 1)
    assert.equal(await page.locator('.my-week__unplaced').count(), 0)
    assert.equal(await page.locator('.my-week__entry[data-start="780"][data-end="1020"]').count(), 1)
    assert.equal(await page.locator('.my-week__entry[data-start="1020"][data-end="1140"]').count(), 1)
    const stored = await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-entry-id="care-qa-schedule-morning"]').waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1')), stored)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    assert.deepEqual(errors, [])
    if (mode === 'unknown' && process.argv[3]) await page.locator('.my-agenda').screenshot({ path: process.argv[3] })
    await page.getByRole('button', { name: '화요일', exact: true }).click()
    await page.locator('.my-agenda__add').click()
    await card.locator('.my-course-picker[aria-busy=false]').waitFor()
    await card.locator('.my-course-choice--care').filter({ hasText: '저녁·연장' }).click()
    const evening = await page.evaluate(() => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.find(entry => entry.id === 'care-qa-schedule-extended'))
    assert.deepEqual(evening.weekdays, [1, 2])
    assert.deepEqual([evening.start, evening.end], [1020, 1140])
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('elementary-schedule-plans-v1'))
      value.plans[0].entries.find(entry => entry.kind === 'school').end = null
      localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify(value))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    assert.match(await page.locator('[data-entry-id="care-qa-schedule-afternoon"]').textContent(), /하교 후–17:00.*시작 확인 필요/)
    await page.getByRole('button', { name: '주간 편집', exact: true }).click()
    assert.equal(await page.locator('.my-week__day[data-weekday="1"] button[aria-label^="오후 돌봄 17:00 종료"]').count(), 1)
    console.log(`PASS: ${mode} care data → morning/afternoon assumptions → course return → evening finish input → week view → persisted reload`)
    await context.close()
  }
} finally { await browser.close() }
