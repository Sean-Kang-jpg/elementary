import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deletePlan, emptyPlans, readPlans, upsertPlan, writePlans, type SchoolPlan } from './plans.ts'
import { isFavorite, readFavorites, refreshFavorite, removeFavorite, saveFavorite, toggleFavorite, type FavoriteRecord } from '../favorites.ts'

const values = new Map<string, string>()
let failWrites = false
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failWrites) throw new Error('quota'); values.set(key, value) },
  removeItem: (key: string) => values.delete(key),
} })
Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { confirm: () => true }) })
const favorite = (id: string): FavoriteRecord => ({ kind: 'school', id, name: id, address: '', latitude: 0, longitude: 0 })
const plan = (id: string): SchoolPlan => ({ schoolId: id, schoolName: id, entryYear: 2027, updatedAt: '2026-10-13',
  entries: [{ id: 'course', kind: 'afterschool', label: '미술', weekdays: [1], start: null, end: null, evidence: 'unknown', participation: 'considering' }] })
beforeEach(() => { values.clear(); failWrites = false })
describe('MY candidate and timetable persistence', () => {
  it('caps additions at three per kind, independently, with idempotent school adds', () => {
    for (const id of ['a', 'b', 'c']) saveFavorite(favorite(id))
    saveFavorite(favorite('a'))
    assert.throws(() => saveFavorite(favorite('d')), /최대 3/)
    for (const id of ['a', 'b', 'c']) saveFavorite({ ...favorite(id), kind: 'apartment', schoolId: 'a', schoolName: 'A', households: 0 })
    assert.equal(readFavorites().length, 6)
    toggleFavorite(favorite('b'))
    saveFavorite(favorite('d'))
    assert.equal(readFavorites().filter((f) => f.kind === 'school').length, 3)
  })
  it('does not truncate existing over-limit records', () => {
    values.set('elementary-favorites-v1', JSON.stringify(['a', 'b', 'c', 'd'].map(favorite)))
    assert.equal(readFavorites().length, 4)
    assert.throws(() => saveFavorite(favorite('e')))
    removeFavorite(favorite('a'))
    assert.equal(readFavorites().length, 3)
  })
  it('keeps apartment public identity across batch rebuilds without using a second slot', () => {
    const apartment: FavoriteRecord = { ...favorite('old-id'), kind: 'apartment', schoolId: 'a', schoolName: 'A', households: 1, publicKey: 'stable-key' }
    saveFavorite(apartment)
    assert.equal(isFavorite('apartment', 'old-id', 'different-key'), false)
    assert.equal(isFavorite('apartment', 'new-id', 'stable-key'), true)
    const rebuilt = { ...apartment, id: 'new-id' }
    saveFavorite(rebuilt)
    assert.equal(readFavorites().length, 1)
    refreshFavorite(rebuilt)
    assert.equal(readFavorites()[0].id, 'new-id')
    toggleFavorite(apartment)
    assert.equal(readFavorites().length, 0)
  })
  it('drops the retired active-plan field from older storage and keeps every draft', () => {
    values.set('elementary-schedule-plans-v1', JSON.stringify({ version: 1, activeSchoolId: 'b', plans: [plan('a'), plan('b')] }))
    assert.deepEqual(readPlans(), { version: 1, plans: [plan('a'), plan('b')] })
  })
  it('removing a school deletes its timetable and keeps other schools', () => {
    saveFavorite(favorite('a'))
    writePlans(upsertPlan(emptyPlans(), plan('a')))
    removeFavorite(favorite('a'))
    assert.equal(readPlans().plans.length, 0)
  })
  it('cancelled removal preserves both school and timetable', () => {
    saveFavorite(favorite('a'))
    writePlans(upsertPlan(emptyPlans(), plan('a')))
    window.confirm = () => false
    assert.equal(removeFavorite(favorite('a')), false)
    assert.equal(readFavorites().length, 1)
    assert.equal(readPlans().plans.length, 1)
    window.confirm = () => true
  })
  it('deleting a draft keeps the other schools', () => {
    const store = upsertPlan(upsertPlan(emptyPlans(), plan('a')), plan('b'))
    assert.deepEqual(deletePlan(store, 'a').plans.map((p) => p.schoolId), ['b'])
  })
  it('rejects corrupt, unsupported and invalid weekday storage without guessing', () => {
    for (const raw of ['{', '{"version":2,"plans":[]}', JSON.stringify({ version: 1, activeSchoolId: 'a', plans: [{ ...plan('a'), entries: [{ ...plan('a').entries[0], weekdays: [7] }] }] })]) {
      values.set('elementary-schedule-plans-v1', raw)
      assert.deepEqual(readPlans(), emptyPlans())
    }
  })
  it('does not publish or overwrite stored plans on quota failure', () => {
    writePlans(upsertPlan(emptyPlans(), plan('a')))
    failWrites = true
    assert.throws(() => writePlans(upsertPlan(emptyPlans(), plan('b'))))
    assert.equal(readPlans().plans[0].schoolId, 'a')
    assert.throws(() => saveFavorite(favorite('a')))
    assert.equal(readFavorites().length, 0)
  })
})
