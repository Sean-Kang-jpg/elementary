import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { schoolChecks } from './schoolChecks.ts'
import { setEntryTimes } from './dayTimes.ts'
import type { ScheduleEntry } from './types'
const school: ScheduleEntry = { id: 'school', kind: 'school', label: '정규수업', weekdays: [1,2,3,4,5], start: null, end: 780, evidence: 'confirmed', participation: 'confirmed' }
const care: ScheduleEntry = { id: 'care', kind: 'care', label: '오후 돌봄', weekdays: [1,2,3,4,5], start: null, startsAfterSchool: true, end: null, evidence: 'unknown', participation: 'planned' }
describe('school confirmation summary', () => {
  it('does not mistake unknown school start for unknown dismissal', () => {
    assert.deepEqual(schoolChecks([school]), [])
  })
  it('groups missing and estimated school days into one item', () => {
    const rows = schoolChecks([{ ...school, weekdays:[1], end:null, evidence:'unknown' }, { ...school,id:'other',weekdays:[2,3,4,5],evidence:'estimated' }])
    assert.equal(rows.length,1)
    assert.match(rows[0].reasons[0], /월요일.*아직 몰라/)
    assert.match(rows[0].reasons[1], /화·수·목·금요일.*예상/)
  })
  it('reports absent weekday school data without inventing times', () => {
    const row = schoolChecks([{ ...school,weekdays:[1,2,3,4] }])[0]
    assert.match(row.reasons[0],/금요일/)
    assert.equal(row.entryId,undefined)
  })
  it('includes care planning defaults and participation independently without mutation', () => {
    const before = JSON.stringify(care)
    const rows = schoolChecks([school,care])
    assert.equal(rows.length,1)
    assert.match(rows[0].reasons.join(' '),/17:00 종료/)
    assert.match(rows[0].reasons.join(' '),/참여가 확정되지/)
    assert.equal(rows[0].kind,'care')
    assert.deepEqual(rows[0].facts.map(fact=>fact.kind),['assumption','participation'])
    assert.equal(JSON.stringify(care),before)
  })
  it('uses per-day overrides rather than warning about a replaced default on every day', () => {
    const changed = setEntryTimes([{...care,end:1020,timeAssumption:'17:00 종료 기본 가정',evidence:'estimated'}], 'care', [1], {start:'dismissal',end:1080})!
    const row=schoolChecks([school,...changed])[0]
    assert.match(row.reasons.find(reason=>reason.includes('기본 가정'))!,/^화·수·목·금요일/)
    assert.match(row.reasons.find(reason=>reason.includes('운영계획 또는 입력'))!,/^월요일/)
    assert.deepEqual(row.facts.find(fact=>fact.kind==='assumption')?.weekdays,[2,3,4,5])
    assert.deepEqual(row.facts.find(fact=>fact.kind==='estimate')?.weekdays,[1])
  })
  it('keeps a time concern after participation is confirmed and vice versa', () => {
    assert.ok(schoolChecks([school,{...care,participation:'confirmed'}])[0].reasons.every(reason=>!reason.includes('참여가')))
    assert.deepEqual(schoolChecks([school,{...care,start:800,startsAfterSchool:false,end:1000,evidence:'confirmed',participation:'applying'}])[0].reasons,['신청 중이에요. 선정 결과와 이용 시작일을 학교에 확인하세요.'])
  })
  it('excludes cancelled, rejected, deleted, vacation and personal entries', () => {
    const rows=schoolChecks([school,{...care,participation:'cancelled'},{...care,participation:'rejected'},{...care,userOverride:{deleted:true}},{...care,term:'vacation'},{...care,kind:'personal'}])
    assert.deepEqual(rows,[])
  })
  it('has no remaining item when school times and participation are confirmed', () => {
    assert.deepEqual(schoolChecks([school,{...care,end:1020,evidence:'confirmed',participation:'confirmed'}]),[])
  })
})
