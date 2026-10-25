// Isolated local visual QA. Uses installed Playwright or the bundled runtime path.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local preview URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
try {
  await context.addInitScript({ path: path.join(root, 'scripts/fixtures/my-schedule-network.js') })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/timetable', base).href)
  await page.locator('#timetable-title').waitFor()
  await page.evaluate(() => {
    const entry = (id, label, weekday, start, kind = 'afterschool', extra = {}) => ({ id, label, kind, weekdays: [weekday], start, end: start + 60, evidence: 'school-plan', participation: 'planned', ...extra })
    const entries = [
      entry('school', '정규수업 4교시', 1, 540, 'school', { weekdays: [1,2,3,4,5], end: 780, participation: 'confirmed', source: { ref: 'qa-school', version: '2026' } }),
      entry('art', '미술', 1, 840), entry('music', '피아노', 1, 930, 'personal'),
      entry('science', '과학 실험', 2, 840), entry('coding', '코딩', 2, 930),
      entry('sports', '축구', 3, 840, 'personal'), entry('math', '수학', 3, 930),
      entry('reading', '영어 독서', 4, 840), entry('dance', '발레', 4, 930),
      entry('care', '오후 돌봄', 5, 780, 'care', { end: 1020 }), entry('custom', '맞춤형 놀이', 5, 840),
      entry('personal', '가족 약속', 1, 1050, 'personal', { participation: 'considering' }),
    ]
    localStorage.setItem('elementary-favorites-v1', JSON.stringify([{ kind: 'school', id: 'qa-schedule', name: '카드 디자인 검사용 학교', address: '운영자료 아님', latitude: 0, longitude: 0 }]))
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{ schoolId: 'qa-schedule', schoolName: '카드 디자인 검사용 학교', entryYear: null, updatedAt: '2026-10-15', entries }] }))
  })
  await page.reload()
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  await page.locator('.my-week__entry').first().waitFor()
  const inspect = () => page.evaluate(() => [...document.querySelectorAll('.my-week__entry')].every(card => {
    const badge = card.querySelector('.my-entry-icon'), style = getComputedStyle(card)
    return card.children.length === 2 && badge?.querySelector('svg') && badge.getAttribute('aria-hidden') === 'true' && badge.textContent === ''
      && style.borderLeftWidth === '0px' && style.borderRightWidth === '0px' && style.borderTopWidth === '0px' && style.borderBottomWidth === '0px'
  }))
  assert.equal(await inspect(), true)
  assert.deepEqual(await page.locator('#my-week-day-1 [data-subject]').evaluateAll(nodes => nodes.map(node => node.dataset.subject)), ['school', 'art', 'music', 'personal'])
  console.log('PASS: simple subject SVG icons, two text rows, and borderless pastel calendar cards')
  if (process.argv[3]) {
    await page.locator('.my-week-section').scrollIntoViewIfNeeded()
    await page.screenshot({ path: process.argv[3] })
  }
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await inspect(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    console.log(`PASS: ${width}px icons and clean cards do not overflow the page`)
    if (width === 390 && process.argv[3]) {
      await page.locator('.my-week-section').scrollIntoViewIfNeeded()
      await page.screenshot({ path: process.argv[3].replace('.png', '-mobile.png') })
    }
  }
  await page.locator('.my-calendar-add').click()
  await page.locator('.my-add-card .my-course-picker[aria-busy=false]').waitFor()
  // Morning care uses the same two text rows with a selection marker, without a subject icon.
  const morning = page.locator('[data-testid=morning-care-choice] .my-course-choice')
  assert.equal(await morning.count(), 1)
  assert.equal(await morning.locator('.my-course-choice__lines').evaluate(node => node.children.length), 2)
  assert.equal(await morning.getAttribute('aria-pressed'), 'false')
  await morning.click()
  assert.equal(await morning.getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.my-course-choice:not([data-testid=morning-care-choice] button)').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.querySelector('.my-entry-icon svg') && node.querySelector('.my-entry-icon').textContent === '' && node.querySelector('.my-course-choice__lines').children.length === 2)), true)
  await page.locator('.my-course-choice[data-program-label]').first().click()
  assert.equal(await page.locator('.my-course-choice[data-program-label]').first().getAttribute('aria-pressed'), 'true')
  console.log('PASS: source selection buttons also use simple SVG icons and remain selectable')
  assert.deepEqual(errors, [])
  console.log('PASS: no browser runtime errors')
} finally { await context.close(); await browser.close() }
