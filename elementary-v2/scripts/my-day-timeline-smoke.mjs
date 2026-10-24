// Isolated visual/interaction QA. Fixtures are local-only; no user profile or database writes.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL explicitly.')
const { chromium } = await import(process.env.CALENDAR_QA_PLAYWRIGHT ? pathToFileURL(process.env.CALENDAR_QA_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_QA_CHROME ? { executablePath: process.env.CALENDAR_QA_CHROME } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
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
      entry('art', 'afterschool', '미술', [1], 840, 900, { source: { ref: 'qa-art', version: '2026' } }),
      entry('science', 'afterschool', '과학 실험', [1], 930, 990),
      entry('math', 'personal', '수학', [1], 1020, 1070),
      entry('care', 'care', '오후 돌봄', [2], 780, 1020),
      entry('custom', 'afterschool', '맞춤형 놀이', [2], 840, 900),
      entry('unknown', 'afterschool', '시간 미확인 프로그램', [4], null, null),
      entry('candidate', 'personal', '피아노', [5], 905, 940, { participation: 'considering' }),
      entry('cancelled', 'personal', '취소 일정', [1], 900, 960, { participation: 'cancelled' }),
    ]
    localStorage.setItem('elementary-favorites-v1', JSON.stringify([{ kind: 'school', id: 'qa-schedule', name: '하루 보기 검사용 학교', address: '운영자료 아님', latitude: 0, longitude: 0 }]))
    localStorage.setItem('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: null, plans: [{ schoolId: 'qa-schedule', schoolName: '하루 보기 검사용 학교', entryYear: null, updatedAt: '2026-10-18', entries }] }))
  })
  await page.reload()
  await page.locator('.my-agenda__card').first().waitFor()
  const stored = await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1'))
  assert.equal(await page.locator('.my-calendar').count(), 0)
  assert.deepEqual(await page.locator('.my-agenda__row').evaluateAll(nodes => nodes.map(node => node.dataset.entryId)), ['morning', 'school', 'art', 'science', 'math'])
  assert.match(await page.locator('[data-entry-id=school]').textContent(), /하교 13:00 \(예상\)/)
  assert.equal(await page.locator('[data-entry-id=school]').textContent().then(text => text.includes('09:00')), false)
  const checkVisual = async () => {
    assert.equal(await page.locator('.my-agenda__card').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => {
      const style = getComputedStyle(node)
      return node.children.length === 2 && node.querySelector('.my-entry-icon[aria-hidden=true] svg') && style.borderLeftWidth === '0px'
        && parseFloat(style.borderRadius) >= 24 && node.getBoundingClientRect().height >= 76
    })), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await page.locator('.my-week-nav button[aria-pressed=true]').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(22, 28, 32)')
  }
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    await checkVisual()
    if (process.argv[3] && [390, 1280].includes(width)) {
      await page.locator('.my-week-section').screenshot({ path: process.argv[3].replace('.png', width === 390 ? '-mobile.png' : '-desktop.png') })
    }
  }
  console.log('PASS: reference-style day view, dark weekday pill, time rail, two-line borderless pastel cards and subject SVGs at 360/390/768/1280px')
  await page.getByRole('button', { name: '화요일', exact: true }).click()
  assert.equal(await page.locator('.my-agenda__card').count(), 3)
  assert.match(await page.locator('.my-agenda__notes').textContent(), /놀이 종료 → 오후 돌봄 15:00–17:00/)
  await page.getByRole('button', { name: '목요일', exact: true }).click()
  assert.match(await page.locator('[data-entry-id=unknown]').textContent(), /시간 확인 필요/)
  await page.getByRole('button', { name: '금요일', exact: true }).click()
  assert.match(await page.locator('[data-entry-id=candidate]').textContent(), /15:05–15:40 · 후보/)
  assert.equal(await page.evaluate(() => localStorage.getItem('elementary-schedule-plans-v1')), stored)
  console.log('PASS: day switching preserves source data, independent care/course selections, uncertain times and candidate state')
  await page.getByRole('button', { name: '월요일', exact: true }).click()
  await page.locator('[data-entry-id=art] button').click()
  assert.match(await page.locator('.my-week-detail').textContent(), /미술/)
  // A school course keeps its offered weekday: other weekday chips are disabled in the edit sheet.
  assert.equal(await page.locator('.my-week-detail').getByRole('button', { name: '화', exact: true }).isDisabled(), true)
  await page.locator('.my-week-detail').getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '화요일', exact: true }).click()
  assert.equal(await page.locator('.my-week-detail').count(), 0)
  await page.locator('.my-agenda__add').click()
  await page.locator('.my-add-card').getByRole('button', { name: '직접 입력', exact: true }).click()
  const dialog = page.locator('.my-calendar-form')
  await dialog.getByLabel('일정 이름').fill('독서 약속')
  await dialog.getByLabel('시작', { exact: true }).fill('16:05')
  await dialog.getByLabel('종료', { exact: true }).fill('16:40')
  assert.equal(await dialog.getByLabel('시작', { exact: true }).getAttribute('step'), '300')
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.match(await page.locator('.my-agenda').textContent(), /독서 약속/)
  const manual = page.getByRole('button', { name: /개인 일정 · 독서 약속/ })
  await manual.click()
  const sheet = page.locator('dialog.my-entry-sheet')
  await sheet.getByLabel('시작', { exact: true }).fill('16:10')
  await sheet.getByRole('button', { name: '저장', exact: true }).click()
  await sheet.waitFor({ state: 'detached' })
  assert.match(await manual.textContent(), /16:10–16:40/)
  console.log('PASS: course weekdays stay limited in the edit sheet; five-minute manual creation and sheet edits persist and update the day cards')
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  assert.equal(await page.locator('.my-week__timeline').count(), 5)
  assert.equal(await page.locator('.my-week-nav button[aria-pressed=true]').getAttribute('aria-label'), '화요일')
  assert.ok(await page.locator('.my-week').evaluate(node => node.scrollLeft > 0))
  await page.getByRole('button', { name: '하루 보기', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '화요일', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.reload()
  await page.getByRole('button', { name: '화요일', exact: true }).click()
  assert.match(await page.locator('.my-agenda').textContent(), /16:10–16:40/)
  await page.getByRole('button', { name: '주간 편집', exact: true }).click()
  const timeline = page.locator('#my-week-day-2 .my-week__timeline')
  await timeline.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.locator('.my-add-card').getByRole('button', { name: '직접 입력', exact: true }).click()
  assert.equal(await dialog.getByLabel('시작', { exact: true }).inputValue(), '14:05')
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: switching editor/day views and reload retains saved entries without browser errors')
} finally { await context.close(); await browser.close() }
