import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { seasonCards, type SeasonItem } from './homeShelves.ts'

const item = (id: string, from: string, to: string, extra: Partial<SeasonItem> = {}): SeasonItem =>
  ({ id, from, to, title: id, body: '', href: `/guide/${id}`, ...extra })

describe('home season cards', () => {
  it('keeps cards whose window holds today, including windows across the new year', () => {
    const items = [item('autumn', '09-15', '11-25'), item('winter', '12-15', '01-31'), item('spring', '02-01', '03-31')]
    assert.deepEqual(seasonCards(items, new Date(2026, 9, 15), 4).map((c) => c.id), ['autumn'])
    assert.deepEqual(seasonCards(items, new Date(2027, 0, 10), 4).map((c) => c.id), ['winter'])
    assert.deepEqual(seasonCards(items, new Date(2026, 11, 20), 4).map((c) => c.id), ['winter'])
  })

  it('counts days to the next deadline and puts the nearest first', () => {
    const items = [item('care', '10-01', '02-28'), item('delay', '10-01', '12-31', { deadline: '12-31' }), item('private', '09-15', '11-25', { deadline: '11-06' })]
    const cards = seasonCards(items, new Date(2026, 9, 15), 4)
    assert.deepEqual(cards.map((c) => [c.id, c.dday]), [['private', 22], ['delay', 77], ['care', null]])
  })

  it('says D-day on the day itself and marks NEW until its date', () => {
    const items = [item('private', '09-15', '11-25', { deadline: '11-06' }), item('morning', '10-15', '03-15', { newUntil: '2026-11-15' })]
    const onDay = seasonCards(items, new Date(2026, 10, 6), 4)
    assert.equal(onDay[0].dday, 0)
    assert.equal(onDay[1].isNew, true)
    assert.equal(seasonCards(items, new Date(2026, 10, 16), 4).find((c) => c.id === 'morning')?.isNew, false)
  })

  it('stops at max', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, '01-01', '12-31'))
    assert.equal(seasonCards(items, new Date(2026, 5, 1), 4).length, 4)
  })
})
