import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sortByTimeOverlap } from './frontyardTimeOrder.ts'

test('sorts by the best same-day overlap, keeping ties and the input order intact', () => {
  const slot = { weekday: 2, start: '14:00', end: '16:00' }
  const partial = { id: 'partial', time_slots: [
    { ...slot, end: '14:30' },
    { ...slot, end: '14:30' },
    { ...slot, weekday: 3 },
  ] }
  const exact = { id: 'exact', time_slots: [slot] }
  const covering = { id: 'covering', time_slots: [{ ...slot, start: '13:30', end: '17:00' }] }
  const posts = [partial, exact, covering]

  assert.deepEqual(sortByTimeOverlap(posts, slot).map((post) => post.id), ['exact', 'covering', 'partial'])
  assert.deepEqual(posts.map((post) => post.id), ['partial', 'exact', 'covering'])
  assert.equal(sortByTimeOverlap(posts, null), posts)
})
