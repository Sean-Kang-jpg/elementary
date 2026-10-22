import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameAcademy } from './savedAcademies.ts'

test('the institution key decides when both have one, otherwise name and address', () => {
  assert.equal(sameAcademy({ name: '가', addressId: 'A', providerKey: 'neis:B10-1' }, { name: '가', addressId: 'A', providerKey: 'neis:B10-2' }), false)
  assert.equal(sameAcademy({ name: '가', addressId: 'A', providerKey: 'neis:B10-1' }, { name: '가(개명)', addressId: 'B', providerKey: 'neis:B10-1' }), true)
  assert.equal(sameAcademy({ name: '가', addressId: 'A' }, { name: '가', addressId: 'A', providerKey: 'neis:B10-1' }), true)
  assert.equal(sameAcademy({ name: '가', addressId: 'A' }, { name: '가', addressId: 'B' }), false)
})
