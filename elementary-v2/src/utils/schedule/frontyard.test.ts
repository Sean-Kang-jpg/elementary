import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addAcademyToPlan, addPostToPlan } from './frontyard.ts'
import type { SchoolPlan } from './plans.ts'

const plan = (): SchoolPlan => ({ schoolId: 'B000000001', schoolName: '예시초등학교', entryYear: 2027, updatedAt: '', entries: [] })
let n = 0
const id = () => `id-${++n}`

test('same times on different weekdays become one entry', () => {
  const result = addPostToPlan(plan(), {
    post_id: 'p1', title: '창의미술반', provider_name: '예시미술학원',
    time_slots: [{ weekday: 3, start: '14:00', end: '15:00' }, { weekday: 1, start: '14:00', end: '15:00' }, { weekday: 5, start: '15:00', end: '16:30' }],
  }, id)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.added, 2)
  const [first, second] = result.plan.entries
  assert.deepEqual(first.weekdays, [1, 3])
  assert.equal(first.start, 840)
  assert.equal(first.label, '예시미술학원 · 창의미술반')
  assert.equal(first.participation, 'considering')
  assert.equal(first.source, undefined)
  assert.equal(first.frontyardPostId, 'p1')
  assert.deepEqual([second.weekdays, second.start, second.end], [[5], 900, 990])
})

test('a post already added, or with no weekday time, adds nothing', () => {
  const once = addPostToPlan(plan(), { post_id: 'p2', title: 't', provider_name: null, time_slots: [{ weekday: 2, start: '13:00', end: '14:00' }] }, id)
  assert.equal(once.ok, true)
  if (!once.ok) return
  assert.deepEqual(addPostToPlan(once.plan, { post_id: 'p2', title: 't', provider_name: null, time_slots: [] }, id), { ok: false, reason: 'exists' })
  assert.deepEqual(addPostToPlan(plan(), { post_id: 'p3', title: 't', provider_name: null, time_slots: [{ weekday: 6, start: '10:00', end: '11:00' }] }, id), { ok: false, reason: 'nothing' })
})

test('an academy from the map goes in with the parent own times and status', () => {
  const result = addAcademyToPlan(plan(), { label: '영어 · 가영어', providerKey: 'neis:B10-9', weekdays: [3, 1, 3], start: 900, end: 960, attending: true }, id)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.entry.weekdays, [1, 3])
  assert.equal(result.entry.participation, 'confirmed')
  assert.equal(result.entry.providerKey, 'neis:B10-9')
  assert.equal(result.entry.source, undefined)
  assert.deepEqual(addAcademyToPlan(plan(), { label: '가', weekdays: [], start: 900, end: 960, attending: false }, id), { ok: false, reason: 'invalid' })
  assert.deepEqual(addAcademyToPlan(plan(), { label: '가', weekdays: [2], start: 960, end: 900, attending: false }, id), { ok: false, reason: 'invalid' })
})
