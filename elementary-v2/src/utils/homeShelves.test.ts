import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { worryCards, type WorryItem } from './homeShelves.ts'

const item = (id: string, from: string, to: string, extra: Partial<WorryItem> = {}): WorryItem =>
  ({ id, from, to, question: id, hint: '', href: `/guide/${id}`, ...extra })

describe('home worry cards', () => {
  it('keeps the undated assignment search first, ahead of deadlines, within max', () => {
    const assignment: WorryItem = { id: 'assignment', question: '배정 학교', hint: '검색', href: '#home-assignment-search' }
    const items = [item('private', '09-15', '11-25', { deadline: '11-06', planId: 'season-private' }), assignment]
    assert.deepEqual(worryCards(items, new Date(2026, 10, 2), 2).map(card => card.id), ['assignment', 'private'])
    assert.deepEqual(worryCards(items, new Date(2026, 10, 2), 1).map(card => card.id), ['assignment'])
    assert.deepEqual(worryCards(items, new Date(2026, 3, 2), 6).map(card => card.id), ['assignment'])
    assert.equal(worryCards(items, new Date(2026, 10, 2), 2)[1].planId, 'season-private')
  })

  it('excludes incomplete date windows and preserves equal-deadline order without mutation', () => {
    const items = [item('first', '10-01', '12-31', { deadline: '12-20' }), item('second', '10-01', '12-31', { deadline: '12-20' }), { id: 'invalid', question: '미완성', hint: '', href: '/map', from: '01-01' }]
    const before = JSON.stringify(items)
    assert.deepEqual(worryCards(items, new Date(2026, 10, 2), 6).map(card => card.id), ['first', 'second'])
    assert.equal(JSON.stringify(items), before)
  })

  it('keeps cards whose window holds today, including windows across the new year', () => {
    const items = [item('autumn', '09-15', '11-25'), item('winter', '12-15', '01-31'), item('spring', '02-01', '03-31')]
    assert.deepEqual(worryCards(items, new Date(2026, 9, 15), 4).map((c) => c.id), ['autumn'])
    assert.deepEqual(worryCards(items, new Date(2027, 0, 10), 4).map((c) => c.id), ['winter'])
    assert.deepEqual(worryCards(items, new Date(2026, 11, 20), 4).map((c) => c.id), ['winter'])
  })

  it('counts days to the next deadline and puts the nearest first', () => {
    const items = [item('care', '10-01', '02-28'), item('delay', '10-01', '12-31', { deadline: '12-31' }), item('private', '09-15', '11-25', { deadline: '11-06' })]
    const cards = worryCards(items, new Date(2026, 9, 15), 4)
    assert.deepEqual(cards.map((c) => [c.id, c.dday]), [['private', 22], ['delay', 77], ['care', null]])
  })

  it('says D-day on the day itself and marks NEW until its date', () => {
    const items = [item('private', '09-15', '11-25', { deadline: '11-06' }), item('morning', '10-15', '03-15', { newUntil: '2026-11-15' })]
    const onDay = worryCards(items, new Date(2026, 10, 6), 4)
    assert.equal(onDay[0].dday, 0)
    assert.equal(onDay[1].isNew, true)
    assert.equal(worryCards(items, new Date(2026, 10, 16), 4).find((c) => c.id === 'morning')?.isNew, false)
  })

  it('stops at max', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, '01-01', '12-31'))
    assert.equal(worryCards(items, new Date(2026, 5, 1), 4).length, 4)
  })
})
