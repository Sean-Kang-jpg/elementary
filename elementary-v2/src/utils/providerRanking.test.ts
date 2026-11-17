import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { providerBadges, providerRank, rankProviders, type RankableInstitution } from './providerRanking.ts'

const inst = (name: string, extra: Partial<RankableInstitution> = {}): RankableInstitution => ({ name, type: '학원', ...extra })

describe('providerRank', () => {
  it('puts an elementary course above a registered vehicle', () => {
    assert.equal(providerRank(inst('가', { levels: ['elem'] }), []), 3)
    assert.equal(providerRank(inst('나', { shuttle_registered: true }), []), 4)
  })

  it('keeps the higher rank and every badge when signals combine', () => {
    const both = inst('가', { levels: ['elem', 'lower'], shuttle_registered: true })
    assert.equal(providerRank(both, []), 3)
    assert.deepEqual(providerBadges(both), ['elementary', 'shuttle'])
  })

  it('ranks arts, sports and dojos without a grade label at 5', () => {
    assert.equal(providerRank(inst('가'), ['arts']), 5)
    assert.equal(providerRank(inst('나', { type: '체육교습업' }), []), 5)
    assert.equal(providerRank(inst('다'), ['math']), 6)
  })

  it('puts secondary-only courses last, even with a vehicle', () => {
    assert.equal(providerRank(inst('가', { levels: ['secondary'] }), ['math']), 7)
    assert.equal(providerRank(inst('나', { levels: ['secondary'], shuttle_registered: true }), []), 4)
    assert.equal(providerRank(inst('다', { levels: ['elem', 'secondary'] }), []), 3)
    assert.deepEqual(providerBadges(inst('다', { levels: ['elem', 'secondary'] })), ['elementary'])
  })
})

describe('rankProviders', () => {
  it('orders by rank, then distance', () => {
    const ranked = rankProviders([
      { address_id: 'near', straight_distance_m: 100, institutions: [inst('수학'), inst('셔틀', { shuttle_registered: true })] },
      { address_id: 'far', straight_distance_m: 700, institutions: [inst('초등', { levels: ['elem'] }), inst('셔틀2', { shuttle_registered: true })] },
    ], () => [])
    assert.deepEqual(ranked.map((row) => row.institution.name), ['초등', '셔틀', '셔틀2', '수학'])
  })

  it('keeps the nearer copy of one institution and drops unnamed ones', () => {
    const ranked = rankProviders([
      { address_id: 'far', straight_distance_m: 600, institutions: [inst('가', { key: 'neis:B10-1' })] },
      { address_id: 'near', straight_distance_m: 200, institutions: [inst('가', { key: 'neis:B10-1' }), inst(' ')] },
    ], () => [])
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0].addressId, 'near')
  })
})
