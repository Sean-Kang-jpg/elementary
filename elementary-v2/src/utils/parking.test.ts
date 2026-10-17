import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARKING_RATIO_MAX, plausibleParkingRatio } from './parking.ts'

test('keeps ordinary ratios, including zero for a complex without data', () => {
  assert.equal(plausibleParkingRatio(0), 0)
  assert.equal(plausibleParkingRatio(1.2), 1.2)
  assert.equal(plausibleParkingRatio(3.5), 3.5)
  assert.equal(plausibleParkingRatio(PARKING_RATIO_MAX), PARKING_RATIO_MAX)
})

test('drops ratios that come from a wrong household count', () => {
  assert.equal(plausibleParkingRatio(57.1), null)
  assert.equal(plausibleParkingRatio(5.01), null)
  assert.equal(plausibleParkingRatio(Number.NaN), null)
})
