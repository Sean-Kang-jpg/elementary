import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyGapEdit } from './gapEditing.ts'
import { answerStarterDismissal, emptyStarter } from './starter.ts'
import type { ScheduleEntry } from './types.ts'

const source: ScheduleEntry = {
  id: 'course', kind: 'afterschool', label: '미술', weekdays: [1, 3], offeredWeekdays: [1, 3, 5],
  start: 840, end: 900, participation: 'considering', evidence: 'school-plan', source: { ref: 'school', version: '1' },
  dayTimes: { 3: { start: 870, end: 930 } },
}

test('editing a public candidate keeps its source and other weekday overrides', () => {
  const edit = { kind: 'afterschool', label: '다른 이름', weekdays: [1], participation: 'considering', time: { start: 845, end: 905 }, original: source } as const
  const change = { ...edit, weekdays: [...edit.weekdays] }
  const [saved] = applyGapEdit([source], change, 'new') ?? []
  assert.equal(saved.label, source.label)
  assert.deepEqual(saved.source, source.source)
  assert.equal(saved.participation, 'considering')
  assert.deepEqual(saved.dayTimes, { 1: { start: 845, end: 905 }, 3: source.dayTimes?.[3] })
  assert.equal(applyGapEdit([{ ...source, participation: 'confirmed' }], change, 'new'), null)
  assert.equal(applyGapEdit([source], { ...change, weekdays: [2] }, 'new'), null)
})

test('new repeated manual schedule stays a candidate with one id', () => {
  const [saved] = applyGapEdit([], { label: '피아노', kind: 'personal', activityType: 'academy', weekdays: [1, 4], participation: 'considering', time: { start: 900, end: 960 } }, 'new') ?? []
  assert.deepEqual([saved.id, saved.weekdays, saved.participation, saved.activityType], ['new', [1, 4], 'considering', 'academy'])
})

test('a single school-check answer does not guess other weekdays', () => {
  const result = answerStarterDismissal('sample', emptyStarter(), [], { default: 'unknown', weekdays: { 2: 'unknown' } }, 2)
  assert.equal(result.entries.length, 1)
  assert.deepEqual(result.entries[0].weekdays, [2])
  assert.equal(result.entries[0].end, 820)
  assert.match(result.entries[0].timeAssumption ?? '', /13:40/)
  assert.equal(result.starter.done, false)
})
