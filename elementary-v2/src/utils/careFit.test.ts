// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { careFit, describeUntil, sortByFit } from './careFit.ts'

describe('careFit', () => {
  it('counts a center closing exactly at the return time as a fit', () => {
    assert.equal(careFit('13:00~19:00', 19 * 60), 'fits')
    assert.equal(careFit('13:00~20:00', 19 * 60), 'fits')
  })
  it('marks a center closing earlier as short', () => {
    assert.equal(careFit('13:00~18:30', 19 * 60), 'short')
  })
  it('does not guess when the hours are empty or malformed', () => {
    assert.equal(careFit(null, 19 * 60), 'unknown')
    assert.equal(careFit('', 19 * 60), 'unknown')
    assert.equal(careFit('오후 7시까지', 19 * 60), 'unknown')
  })
})

describe('sortByFit', () => {
  const center = (term_hours: string | null, straight_distance_m: number) => ({ term_hours, straight_distance_m })
  it('puts fits first, then unknown, then short, nearest first within each', () => {
    const near = center('13:00~18:00', 100)
    const unknown = center(null, 200)
    const farFit = center('13:00~20:00', 900)
    const nearFit = center('13:00~19:00', 300)
    assert.deepEqual(sortByFit([near, unknown, farFit, nearFit], 19 * 60), [nearFit, farFit, unknown, near])
  })
  it('leaves the input as it was', () => {
    const input = [center('13:00~18:00', 100), center('13:00~20:00', 900)]
    const before = [...input]
    sortByFit(input, 19 * 60)
    assert.deepEqual(input, before)
  })
})

describe('describeUntil', () => {
  it('says the hour, and the minutes when there are any', () => {
    assert.equal(describeUntil(19 * 60), '19시')
    assert.equal(describeUntil(17 * 60 + 30), '17시 30분')
  })
})
