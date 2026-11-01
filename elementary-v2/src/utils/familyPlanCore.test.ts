import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { daysSince, daysUntil, dueBadge, groupTimeline, mergeTimeline, nextDateOf, validPinned, type PinnedItem, type RoadmapViewLike } from './familyPlanCore.ts'

const pin = (id: string, when: PinnedItem['when']): PinnedItem => ({ id, title: id, href: `/guide/${id}`, when, addedAt: '2026-11-01T00:00:00.000Z' })

const admission = (month: number): RoadmapViewLike => ({
  stage: 'admission',
  month,
  now: [{ id: 'nov-a', text: '11월 할 일', link: '/guide/a' }],
  upcoming: [
    { month: 12, tasks: [{ id: 'dec-a', text: '12월 할 일' }] },
    { month: 1, tasks: [{ id: 'jan-a', text: '1월 할 일' }] },
  ],
})

describe('family plan timeline', () => {
  it('orders this month, then a date inside it, then later months and their dates', () => {
    const now = new Date(2026, 10, 1)
    const entries = mergeTimeline(admission(11), [pin('notice', { kind: 'date', date: '2026-12-20' }), pin('soon', { kind: 'date', date: '2026-11-06' })], {}, now)
    assert.deepEqual(entries.map((e) => e.id), ['nov-a', 'soon', 'dec-a', 'notice', 'jan-a'])
  })

  it('puts a month before a date on its first day, even at a month end', () => {
    const now = new Date(2026, 10, 30)
    const entries = mergeTimeline(admission(11), [pin('dec-first', { kind: 'date', date: '2026-12-01' })], {}, now)
    assert.deepEqual(entries.map((e) => e.id).slice(1, 3), ['dec-a', 'dec-first'])
  })

  it('reads January as next year and keeps a missed date ahead of everything', () => {
    const now = new Date(2026, 11, 15)
    const roadmap: RoadmapViewLike = { stage: 'admission', month: 12, now: [], upcoming: [{ month: 1, tasks: [{ id: 'jan-a', text: '' }] }] }
    const entries = mergeTimeline(roadmap, [pin('missed', { kind: 'date', date: '2026-12-01' }), pin('later', { kind: 'date', date: '2027-02-01' })], {}, now)
    assert.deepEqual(entries.map((e) => e.id), ['missed', 'jan-a', 'later'])
  })

  it('keeps the roadmap entry when a pinned item has the same id, and reads done from the checklist', () => {
    const entries = mergeTimeline(admission(11), [pin('nov-a', { kind: 'anytime' })], { 'nov-a': true }, new Date(2026, 10, 1))
    const first = entries.find((e) => e.id === 'nov-a')
    assert.equal(entries.filter((e) => e.id === 'nov-a').length, 1)
    assert.equal(first?.source, 'roadmap')
    assert.equal(first?.done, true)
  })

  it('dates a task with a decree day in the year its month falls in, and keeps a passed one as missed', () => {
    const roadmap: RoadmapViewLike = {
      stage: 'admission',
      month: 12,
      now: [{ id: 'notice', text: '', due: '12-20' }],
      upcoming: [{ month: 1, tasks: [{ id: 'jan-a', text: '' }] }],
    }
    const entries = mergeTimeline(roadmap, [], {}, new Date(2026, 11, 25))
    assert.deepEqual(entries.map((e) => e.when), [{ kind: 'date', date: '2026-12-20' }, { kind: 'month', month: 1 }])
    assert.equal(daysUntil(entries[0].when, new Date(2026, 11, 25)), -5)
    const autumn: RoadmapViewLike = { stage: 'admission', month: 11, now: [], upcoming: [{ month: 12, tasks: [{ id: 'defer', text: '', due: '12-31' }] }] }
    assert.deepEqual(mergeTimeline(autumn, [], {}, new Date(2026, 10, 1))[0].when, { kind: 'date', date: '2026-12-31' })
  })

  it('groups by month, folding missed dates into this month and undated items last', () => {
    const now = new Date(2026, 10, 15)
    const entries = mergeTimeline(admission(11), [
      pin('missed', { kind: 'date', date: '2026-10-30' }),
      pin('dec-date', { kind: 'date', date: '2026-12-20' }),
      pin('free', { kind: 'anytime' }),
    ], {}, now)
    assert.deepEqual(groupTimeline(entries, now).map((g) => [g.month, g.entries.map((e) => e.id)]), [
      [11, ['missed', 'nov-a']],
      [12, ['dec-a', 'dec-date']],
      [1, ['jan-a']],
      [null, ['free']],
    ])
  })

  it('shows planning-stage tasks without a month, after dated items', () => {
    const roadmap: RoadmapViewLike = { stage: 'planning', month: 11, now: [{ id: 'plan-zone', text: '' }], upcoming: [] }
    const entries = mergeTimeline(roadmap, [pin('d', { kind: 'date', date: '2027-03-02' })], {}, new Date(2026, 10, 1))
    assert.deepEqual(entries.map((e) => [e.id, e.when.kind]), [['d', 'date'], ['plan-zone', 'anytime']])
  })
})

describe('family plan helpers', () => {
  it('turns MM-DD into the next date, today included', () => {
    assert.equal(nextDateOf('12-20', new Date(2026, 10, 1)), '2026-12-20')
    assert.equal(nextDateOf('11-01', new Date(2026, 10, 1)), '2026-11-01')
    assert.equal(nextDateOf('11-06', new Date(2026, 10, 10)), '2027-11-06')
    assert.equal(nextDateOf('1106', new Date(2026, 10, 10)), null)
  })

  it('labels a dated item by days left, soon within two weeks', () => {
    const now = new Date(2026, 10, 1)
    assert.deepEqual(dueBadge({ kind: 'date', date: '2026-11-01' }, now), { text: '오늘', tone: 'soon' })
    assert.deepEqual(dueBadge({ kind: 'date', date: '2026-11-15' }, now), { text: 'D-14', tone: 'soon' })
    assert.deepEqual(dueBadge({ kind: 'date', date: '2026-11-30' }, now), { text: 'D-29', tone: 'later' })
    assert.deepEqual(dueBadge({ kind: 'date', date: '2026-10-31' }, now), { text: '지남', tone: 'missed' })
    assert.equal(dueBadge({ kind: 'month', month: 12 }, now), null)
  })

  it('counts calendar days since the last visit', () => {
    assert.equal(daysSince('2026-10-31T23:50:00', new Date(2026, 10, 1, 0, 10)), 1)
    assert.equal(daysSince('2026-11-01T08:00:00', new Date(2026, 10, 1, 20, 0)), 0)
    assert.equal(daysSince(null), null)
    assert.equal(daysSince('broken'), null)
  })

  it('rejects stored items that would break the page', () => {
    assert.equal(validPinned(pin('a', { kind: 'month', month: 12 })), true)
    assert.equal(validPinned(pin('a', { kind: 'month', month: 13 })), false)
    assert.equal(validPinned({ ...pin('a', { kind: 'anytime' }), href: 'https://example.com' }), false)
    assert.equal(validPinned(pin('a', { kind: 'date', date: '2026-1-1' })), false)
  })
})
