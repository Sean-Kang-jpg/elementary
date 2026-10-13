import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVITY_MARKER_ART, CARE_MARKER_ART, SCHOOL_MARKER_ART, apartmentMarkerArt } from './mapMarkerArt.ts'

describe('miniature marker art', () => {
  it('keeps age colour identity shared with the apartment scene', () => {
    assert.ok(apartmentMarkerArt('new').includes('#c5d6e8'))
    assert.ok(apartmentMarkerArt('mid').includes('#b6dbca'))
    assert.ok(apartmentMarkerArt('old').includes('#ead0a5'))
    assert.ok(apartmentMarkerArt('unknown').includes('#d3dade'))
  })
  it('uses cached decorative inline vectors with no external resources', () => {
    for (const art of [SCHOOL_MARKER_ART, CARE_MARKER_ART, ACTIVITY_MARKER_ART, apartmentMarkerArt('new'), apartmentMarkerArt('mid'), apartmentMarkerArt('old'), apartmentMarkerArt('unknown')]) {
      assert.ok(art.includes('viewBox="0 0 24 24"') && art.includes('aria-hidden="true"'))
      assert.ok(!/https?:|<script|<image|onload=|onclick=/.test(art))
      assert.ok(art.length < 1500)
    }
    assert.equal(apartmentMarkerArt('old'), apartmentMarkerArt('old'))
  })
})
