import test from 'node:test'
import assert from 'node:assert/strict'
import { addressIdentity, matchSchool, parsePage } from './collect-neis-poc.mjs'

const school = { school_id: 'B1', schoolinfo_code: 'S1', school_name: '샘플초등학교', neis_office_code: 'J10', road_address: '경기도 성남시 길 12-3 (동)' }
const row = { ATPT_OFCDC_SC_CODE: 'J10', SD_SCHUL_CODE: '1234567', SCHUL_NM: '샘플초등학교', SCHUL_KND_SC_NM: '초등학교', ORG_RDNMA: '경기도 성남시 길 12-3', PRIVATE_FIELD: 'must not persist' }
const page = (rows, total = rows.length) => ({ schoolInfo: [{ head: [{ list_total_count: total }, { RESULT: { CODE: 'INFO-000' } }] }, { row: rows }] })

test('exact school/address accepts NEIS identity, not schoolinfo identity', () => {
  const result = matchSchool(school, [row])
  assert.equal(result.neis_school_code, '1234567')
  assert.equal(result.schoolinfo_code, 'S1')
  assert.equal(result.status, 'verified_exact_name_address')
})
test('whitespace and parenthetical normalization preserves building number', () => {
  assert.equal(addressIdentity(school.road_address), addressIdentity(row.ORG_RDNMA))
  assert.notEqual(addressIdentity('길 12-3'), addressIdentity('길 123'))
})
test('address mismatch is held, never fuzzy accepted', () => assert.equal(matchSchool(school, [{ ...row, ORG_RDNMA: '경기도 다른길 12-3' }]).status, 'hold_address_mismatch'))
test('two exact identities are ambiguous', () => assert.equal(matchSchool(school, [row, { ...row, SD_SCHUL_CODE: '7654321' }]).status, 'hold_ambiguous'))
test('duplicate same code is not a second school', () => assert.equal(matchSchool(school, [row, row]).status, 'verified_exact_name_address'))
test('wrong office and school kind cannot match', () => assert.equal(matchSchool(school, [{ ...row, ATPT_OFCDC_SC_CODE: 'Q10' }, { ...row, SCHUL_KND_SC_NM: '중학교' }]).status, 'hold_no_name_match'))
test('missing address and malformed code cannot match', () => {
  assert.equal(matchSchool({ ...school, road_address: null }, [row]).neis_school_code, null)
  assert.equal(matchSchool(school, [{ ...row, SD_SCHUL_CODE: 'S123' }]).status, 'hold_invalid_code')
})
test('candidate output uses only public field whitelist', () => assert.equal('PRIVATE_FIELD' in matchSchool(school, [row]).candidates[0], false))
test('success parses rows and total separately', () => assert.deepEqual(parsePage(page([row], 2), 'schoolInfo'), { rows: [row], total: 2, code: 'INFO-000' }))
test('INFO-200 is empty, not transport failure', () => assert.deepEqual(parsePage({ RESULT: { CODE: 'INFO-200' } }, 'schoolInfo'), { rows: [], total: 0, code: 'INFO-200' }))
test('invalid key fails with safe code', () => assert.throws(() => parsePage({ RESULT: { CODE: 'ERROR-290' } }, 'schoolInfo'), error => error.safeCode === 'ERROR-290'))
test('malformed payload/count fails closed', () => {
  assert.throws(() => parsePage({}, 'schoolInfo'))
  assert.throws(() => parsePage(page([row], 0), 'schoolInfo'))
})
