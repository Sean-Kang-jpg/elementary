import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeWeek } from './engine.ts'
import { gaps, planCoverage } from './coverage.ts'
import { coverageUntil, emptyStarter } from './starter.ts'
import { gapRange } from './gapMap.ts'
import type { ScheduleEntry } from './types.ts'

const school: ScheduleEntry = { id: 's', kind: 'school', label: '수업', start: null, end: 770, weekdays: [1, 2, 3, 4, 5], participation: 'confirmed', evidence: 'estimated' }
const activity: ScheduleEntry = { id: 'a', kind: 'personal', label: '일정', start: 840, end: 900, weekdays: [1], participation: 'planned', evidence: 'confirmed' }

test('day intervals share the return cutoff and coverage total', () => {
  const until = coverageUntil({ ...emptyStarter(), returnAt: 1020 })!
  const days = computeWeek([school, activity], { from: 'dismissal', to: until })
  assert.deepEqual(gaps(days[0]), [[770, 840], [900, 1020]])
  assert.deepEqual(planCoverage([school, activity], until), {
    state: 'gaps', until, days: [1, 2, 3, 4, 5], minutes: days.flatMap(gaps).reduce((sum, [from, to]) => sum + to - from, 0),
  })
  assert.equal(coverageUntil({ ...emptyStarter(), returnAt: 'dismissal' }), null)
  assert.equal(coverageUntil(emptyStarter()), 1140)
})

test('unknown times stay out of actionable gaps; candidates do not fill them', () => {
  const window = { from: 'dismissal', to: 1020 } as const
  assert.deepEqual(gaps(computeWeek([], window)[0]), [])
  assert.deepEqual(gaps(computeWeek([school, { ...activity, end: null }], window)[0]), [])
  assert.deepEqual(gaps(computeWeek([school, { ...activity, participation: 'considering' }], window)[0]), [[770, 1020]])
})

test('tap has a 10-minute start and respects the gap end', () => {
  assert.deepEqual(gapRange(1, 773, 870, 773), { weekday: 1, start: 780, end: 840 })
  assert.deepEqual(gapRange(1, 773, 870, 869), { weekday: 1, start: 860, end: 870 })
})
