import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { APARTMENT_PALETTE, apartmentAge, apartmentAgeLabel, apartmentEra, apartmentSilhouetteCount } from './apartmentVisual.ts'

describe('apartment information symbol', () => {
  it('keeps household density thresholds and boundaries', () => {
    for (const [households, count] of [[0, 1], [299, 1], [300, 2], [999, 2], [1000, 3], [2999, 3], [3000, 4], [10000, 4]]) {
      assert.equal(apartmentSilhouetteCount(households), count)
    }
  })
  it('keeps age boundaries independent from household density', () => {
    for (const [age, era] of [[0, 'new'], [10, 'new'], [11, 'mid'], [25, 'mid'], [26, 'old'], [47, 'old']] as const) {
      assert.equal(apartmentEra(age), era)
    }
  })
  it('does not call missing or invalid age new', () => {
    for (const value of [null, -1, NaN, Infinity]) {
      assert.equal(apartmentEra(value), 'unknown')
      assert.equal(apartmentAgeLabel(value), '연식 미확인')
    }
    assert.equal(apartmentAge(undefined, undefined, 2026), null)
    assert.equal(apartmentAge(0, 0, 2026), null)
    assert.equal(apartmentAge(-1, 2027, 2026), null)
    assert.equal(apartmentAge(0, 2025.5, 2026), null)
  })
  it('uses the original positive age preference and valid-year fallback', () => {
    assert.equal(apartmentAge(33, 1993, 2026), 33)
    assert.equal(apartmentAge(0, 1979, 2026), 47)
    assert.equal(apartmentAge(0, 2026, 2026), 0)
    assert.equal(apartmentAgeLabel(apartmentAge(0, 2026, 2026)), '신축')
    assert.equal(apartmentAgeLabel(33), '33년차')
  })
  it('keeps small age labels readable on every shared surface', () => {
    const luminance = (hex: string) => {
      const rgb = hex.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    for (const color of Object.values(APARTMENT_PALETTE)) {
      assert.ok((luminance(color.surface) + 0.05) / (luminance(color.ink) + 0.05) >= 4.5)
    }
  })
})
