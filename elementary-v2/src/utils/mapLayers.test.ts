import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MAP_LAYERS, layersForTopic, setMapLayer, type MapLayer } from './mapLayers.ts'

describe('independent map information layers', () => {
  it('keeps the existing apartment default without auto-loading facilities', () => {
    assert.deepEqual(DEFAULT_MAP_LAYERS, { apartments: true, care: false, activity: false })
  })
  it('opens all three topics without disabling another visible layer', () => {
    let layers = DEFAULT_MAP_LAYERS
    for (const topic of ['care', 'activity', 'assignment', 'school'] as const) layers = layersForTopic(layers, topic)
    assert.deepEqual(layers, { apartments: true, care: true, activity: true })
    assert.deepEqual(DEFAULT_MAP_LAYERS, { apartments: true, care: false, activity: false })
  })
  it('can independently disable every combination without mutating the input', () => {
    for (let mask = 0; mask < 8; mask++) {
      const before = { apartments: Boolean(mask & 1), care: Boolean(mask & 2), activity: Boolean(mask & 4) }
      for (const layer of ['apartments', 'care', 'activity'] as MapLayer[]) {
        assert.deepEqual(setMapLayer(before, layer, !before[layer]), { ...before, [layer]: !before[layer] })
        assert.equal(before[layer], Boolean(mask & (layer === 'apartments' ? 1 : layer === 'care' ? 2 : 4)))
      }
    }
  })
  it('school topic preserves all off and each specific topic restores only its related layer', () => {
    const off = { apartments: false, care: false, activity: false }
    assert.equal(layersForTopic(off, 'school'), off)
    assert.deepEqual(layersForTopic(off, 'assignment'), { ...off, apartments: true })
    assert.deepEqual(layersForTopic(off, 'care'), { ...off, care: true })
    assert.deepEqual(layersForTopic(off, 'activity'), { ...off, activity: true })
  })
})
