// Isolated local QA for morning → compressed school → afternoon. Never writes school data.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local preview URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } })
try {
  await context.addInitScript({ path: path.join(root, 'scripts/fixtures/my-schedule-network.js') })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/timetable', base).href)
  await page.locator('#timetable-title').waitFor()
  await page.evaluate(() => {
    const entry = (id, kind, label, weekdays, start, end, extra = {}) => ({ id, kind, label, weekdays, start, end, evidence: 'school-plan', participation: 'planned', ...extra })
    const entries = [
      entry('school', 'school', '정규수업 4교시', [1,2,3,4,5], null, 780, { participation: 'confirmed', source: { ref: 'qa-school', version: '2026' } }),
      entry('morning', 'care', '아침 돌봄', [1,3], 450, 520, { source: { ref: 'school_care_hours:qa-schedule:morning', version: '2026 · QA' } }),
      entry('course', 'afterschool', '미술', [2], 840, 900, { source: { ref: 'qa-course', version: '2026' } }),
      entry('personal', 'personal', '피아노', [1], 960, 1020),
    ]
    localStorage.setItem('elementary-favorites-v1', JSON.stringify([{ kind: 'school', id: 'qa-schedule', name: '아침 시간표 검사용 학교', address: '운영자료 아님', latitude: 0, longitude: 0 }]))
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{ schoolId: 'qa-schedule', schoolName: '아침 시간표 검사용 학교', entryYear: null, updatedAt: '2026-10-15', entries }] }))
  })
  await page.reload()
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  await page.locator('[data-testid=morning-care-week]').waitFor()
  const stored = await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1'))
  assert.equal(await page.locator('[data-band=morning]').count(), 2)
  assert.equal(await page.locator('#my-week-day-2 [data-band=morning]').count(), 0)
  assert.equal(await page.locator('.my-school-fold__card').count(), 5)
  assert.equal(await page.locator('.my-week__timeline .my-week__entry--school').count(), 0)
  assert.equal(await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1')), stored)
  console.log('PASS: chosen morning weekdays precede compact school rows without mutating the plan')
  assert.equal(await page.evaluate(() => {
    const day = document.querySelector('#my-week-day-1'), morning = day.querySelector('.my-morning__timeline').getBoundingClientRect(), card = day.querySelector('[data-band=morning]').getBoundingClientRect()
    const fold = day.querySelector('.my-school-fold').getBoundingClientRect(), afternoon = day.querySelector('.my-week__timeline').getBoundingClientRect()
    return Math.abs(card.top - morning.top - 36) < 1 && Math.abs(card.height - 84) < 1 && fold.height === 64 && Math.abs(afternoon.top - fold.bottom) < 1
      && [...document.querySelectorAll('.my-week__timeline')].every(node => Math.abs(node.getBoundingClientRect().top - afternoon.top) < 1)
  }), true)
  assert.match(await page.locator('#my-week-day-1 .my-school-fold').textContent(), /하교 13:00/)
  assert.equal(await page.locator('.my-morning__axis').textContent(), '07:0008:0009:00')
  console.log('PASS: exact morning duration, explicit 64px school compression, aligned afternoon axes and real dismissal')
  await page.locator('#my-week-day-1 [data-band=morning]').click()
  // 2026-10-23: 카드를 누르면 편집 시트가 열리고, 학교 자료의 돌봄 시간도 이 계획에서만 바꿀 수 있다.
  const sheet = page.locator('dialog.my-entry-sheet')
  assert.equal(await sheet.getByLabel('시작', { exact: true }).inputValue(), '07:30')
  assert.equal(await sheet.getByLabel('종료', { exact: true }).inputValue(), '08:40')
  await sheet.getByRole('button', { name: '닫기' }).click()
  await sheet.waitFor({ state: 'detached' })
  console.log('PASS: morning source times open in the edit sheet with the published hours')
  await page.locator('.my-week-section').scrollIntoViewIfNeeded()
  if (process.argv[3]) await page.screenshot({ path: process.argv[3] })
  const card = page.locator('#my-week-day-1 .my-week__entry--editable')
  await card.scrollIntoViewIfNeeded()
  const bounds = await card.boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 15)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 21, { steps: 3 })
  await page.mouse.up()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans[0].entries.find(e => e.id === 'personal').start === 965)
  console.log('PASS: afternoon drag remains precisely five minutes despite the added morning bands')
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.locator('.my-week-section').scrollIntoViewIfNeeded()
  await page.locator('.my-week-nav button').nth(2).click()
  await page.waitForFunction(() => document.querySelector('.my-week').scrollLeft > 300)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.my-calendar__axis').getBoundingClientRect().left < document.querySelector('.my-week').getBoundingClientRect().left), true)
  if (process.argv[3]) await page.screenshot({ path: process.argv[3].replace('.png', '-mobile.png') })
  console.log('PASS: morning, compressed school and afternoon scroll together while the time axis stays fixed')
  const updateMorning = async change => page.evaluate(change => {
    const value = JSON.parse(localStorage.getItem('elementary-schedule-plans-v1'))
    Object.assign(value.plans[0].entries.find(e => e.id === 'morning'), change)
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify(value)); window.dispatchEvent(new Event('storage'))
  }, change)
  await updateMorning({ start: null, end: null })
  // Since 2026-10-20 unknown morning hours are drawn as a labelled 08:00–09:00 planning default.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-band=morning]')].some(band => band.textContent.includes('기본 가정')))
  assert.equal(await page.locator('.my-morning__unknown-card').count(), 0)
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-band=morning]')].every(band => band.textContent.includes('08:00–09:00') && band.textContent.includes('기본 가정'))), true)
  console.log('PASS: unknown morning times show only as a labelled planning default')
  await updateMorning({ participation: 'cancelled' })
  await page.waitForFunction(() => !document.querySelector('[data-testid=morning-care-week]'))
  assert.equal(await page.locator('.my-week__entry--school').count(), 5)
  assert.equal(await page.locator('.my-school-fold').count(), 0)
  assert.match(await page.locator('.my-calendar-instructions').textContent(), /12:00~19:00/)
  console.log('PASS: cancelling the last morning plan restores the existing afternoon-only view')
  assert.deepEqual(errors, [])
  console.log('PASS: no browser runtime errors')
} finally { await context.close(); await browser.close() }
