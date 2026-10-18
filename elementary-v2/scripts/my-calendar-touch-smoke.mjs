// Optional Playwright touch QA. Pass a local preview URL; use installed or bundled Playwright.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local preview URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
try {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/my', base).href)
  await page.locator('#my-title').waitFor()
  await page.evaluate(() => {
    localStorage.setItem('elementary-favorites-v1', JSON.stringify([{ kind: 'school', id: 'qa-touch', name: '터치 검사용 학교', address: '운영자료 아님', latitude: 0, longitude: 0 }]))
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{ schoolId: 'qa-touch', schoolName: '터치 검사용 학교', entryYear: null, updatedAt: '2026-10-15', entries: [{ id: 'touch-entry', label: '피아노', kind: 'personal', weekdays: [1], start: 840, end: 900, evidence: 'estimated', participation: 'planned' }] }] }))
  })
  await page.reload()
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  await page.locator('.my-week-section').scrollIntoViewIfNeeded()
  const rect = await page.locator('#my-week-day-1 .my-week__timeline').boundingBox()
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + 300)
  await page.locator('.my-add-card').getByRole('button', { name: '직접 입력', exact: true }).click()
  const dialog = page.locator('.my-add-card .my-calendar-form')
  await dialog.waitFor()
  console.log('PASS: real touch tap creates a mobile editor')
  await dialog.getByLabel('일정 이름').fill('독서')
  await dialog.getByLabel('시작', { exact: true }).fill('15:05')
  await dialog.getByLabel('종료', { exact: true }).fill('14:00')
  assert.equal(await dialog.getByLabel('시작', { exact: true }).inputValue(), '15:05')
  assert.equal(await dialog.getByLabel('종료', { exact: true }).inputValue(), '14:00')
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  assert.match(await dialog.getByRole('alert').textContent(), /확인/)
  console.log('PASS: mobile native time inputs retain values and reject a reversed interval')
  await dialog.getByLabel('종료', { exact: true }).fill('15:40')
  await dialog.locator('.my-time-fields label:last-child select').selectOption('4')
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.find(entry => entry.label === '독서'))
  assert.deepEqual([saved.weekdays, saved.start, saved.end], [[4], 905, 940])
  console.log('PASS: mobile time and weekday changes persist exactly')
  await page.locator('.my-week-nav button').first().click()
  await page.waitForFunction(() => document.querySelector('.my-week').scrollLeft < 2)
  await page.locator('.my-week-section').scrollIntoViewIfNeeded()
  const empty = await page.locator('#my-week-day-1 .my-week__timeline').boundingBox()
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const x = empty.x + empty.width * .8, y = empty.y + 320
  await touch('touchStart', x, y)
  for (const delta of [20, 50, 80, 120]) await touch('touchMove', x - delta, y)
  await touch('touchEnd', x - 120, y)
  await page.waitForFunction(() => document.querySelector('.my-week').scrollLeft > 30)
  assert.equal(await page.locator('.my-add-card').count(), 0)
  console.log('PASS: horizontal touch scrolling does not accidentally create an event')
  await page.waitForFunction(() => {
    const left = document.querySelector('.my-week').scrollLeft
    if (window.qaLastScroll !== left) { window.qaLastScroll = left; window.qaScrollAt = performance.now(); return false }
    return performance.now() - window.qaScrollAt > 180
  })
  await page.locator('.my-week-nav button').first().click()
  await page.waitForFunction(() => document.querySelector('.my-week').scrollLeft < 2)
  const card = page.locator('#my-week-day-1 .my-week__entry--editable')
  const bounds = await card.boundingBox()
  await page.evaluate(() => {
    window.qaTouchEvents = []
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) document.addEventListener(type, event => window.qaTouchEvents.push({ type, x: event.clientX, y: event.clientY, scroll: document.querySelector('.my-week').scrollLeft, day: event.target.closest('[data-weekday]')?.dataset.weekday }), true)
  })
  const centerX = bounds.x + bounds.width / 2, centerY = bounds.y + 15
  await touch('touchStart', centerX, centerY)
  for (const delta of [10, 20, 36]) await touch('touchMove', centerX, centerY + delta)
  await touch('touchEnd', centerX, centerY + 36)
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.find(e => e.id === 'touch-entry').start === 870)
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.find(e => e.id === 'touch-entry'))
  if (moved.weekdays[0] !== 1) console.log(await page.evaluate(() => ({ events: window.qaTouchEvents, scroll: document.querySelector('.my-week').scrollLeft })), bounds)
  assert.deepEqual([moved.weekdays, moved.end], [[1], 930])
  console.log('PASS: real touch drag moves a manual event by 30 minutes while preserving duration')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('PASS: no horizontal page overflow or browser runtime errors')
  if (process.argv[3]) {
    await page.locator('.my-week-section').scrollIntoViewIfNeeded()
    await page.screenshot({ path: process.argv[3] })
  }
} finally { await context.close(); await browser.close() }
