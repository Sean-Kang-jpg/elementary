import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizePeriods } from './collect-neis-grade1-periods.mjs'

const row = (ymd, cls, perio, grade = '1') => ({ ALL_TI_YMD: ymd, CLASS_NM: cls, PERIO: String(perio), GRADE: grade })
const day = (ymd, cls, n) => Array.from({ length: n }, (_, i) => row(ymd, cls, i + 1))

test('periods per weekday are counted per date and class', () => {
  // 2026-09-14 is a Monday, 09-16 a Wednesday
  const rows = [...day('20260914', '1', 5), ...day('20260914', '2', 5), ...day('20260916', '1', 4), ...day('20260916', '2', 4)]
  const summary = summarizePeriods(rows)
  assert.equal(summary.class_count, 2)
  assert.deepEqual(summary.weekdays['월'], { mode: 5, share: 1, min: 5, max: 5, observations: 2 })
  assert.equal(summary.weekdays['수'].mode, 4)
  assert.equal(summary.weekdays['화'], null)
})

test('a class that differs lowers the share instead of changing the mode', () => {
  const rows = [...day('20260914', '1', 5), ...day('20260914', '2', 5), ...day('20260914', '3', 6)]
  assert.deepEqual(summarizePeriods(rows).weekdays['월'], { mode: 5, share: 0.67, min: 5, max: 6, observations: 3 })
})

test('duplicate period rows and other grades are ignored', () => {
  const rows = [...day('20260914', '1', 4), row('20260914', '1', 4), ...day('20260914', '1', 6).map(r => ({ ...r, GRADE: '2' }))]
  assert.equal(summarizePeriods(rows).weekdays['월'].mode, 4)
})
