import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SchoolCareHours } from '../../types'
import { morningCareFromLegacy, parseMorningTime, publicInfoUrl, unknownMorningCare } from '../morningCare.ts'
import { isMorningCareEntry, morningCareEntry } from './morningCare.ts'

const care: SchoolCareHours = {
  school_id: 'qa-morning', source_year: 2025, status: 'stated', afternoon_end: '17:00',
  extended_end: null, extended_condition: null, morning_hours: '07:30-08:40', grades: '1~2', source: 'QA 운영계획',
}

describe('아침돌봄 기존 자료 호환', () => {
  it('자료 없음·빈 시간·미운영처럼 보이는 원문을 운영 여부로 해석하지 않는다', () => {
    assert.equal(morningCareFromLegacy(null).status, 'unknown')
    for (const value of [null, '', ' ', '미운영', '없음', '학교 문의']) {
      const info = morningCareFromLegacy({ ...care, morning_hours: value })
      assert.equal(info.status, 'unknown')
      assert.equal(info.startTime, null)
      assert.equal(morningCareEntry(care.school_id, info, [1]), null)
    }
  })
  it('시간 기재만 옮기며 등교시각·대상·요일·신청 조건은 채우지 않는다', () => {
    const info = morningCareFromLegacy({ ...care, status: 'school_check_needed' })
    assert.equal(info.status, 'reported')
    assert.equal(info.startTime, '07:30')
    assert.equal(info.endTime, '08:40')
    for (const key of ['arrivalTime', 'grades', 'weekdays', 'application', 'applicationUrl'] as const) assert.equal(info[key], null)
    assert.equal(info.schoolYear, 2025)
    assert.equal(info.source, care.source)
  })
  it('지원하는 시간 구분자는 읽고 불완전·역전·오후 시간은 자동 배치하지 않는다', () => {
    for (const value of ['7:30 ~ 8:40', '07:30～08:40', '07:30–08:40']) assert.equal(morningCareFromLegacy({ ...care, morning_hours: value }).startTime, '07:30')
    for (const value of ['08:40-07:30', '07:30-07:30', '24:00-25:00', '07:70-08:40', '07:30-08:40 (월수)', '오전 7시부터', '17:00-18:00']) {
      const info = morningCareFromLegacy({ ...care, morning_hours: value })
      assert.equal(info.startTime, null, value)
      assert.equal(info.rawHours, value)
    }
    assert.equal(parseMorningTime('07:30oops'), null)
    assert.equal(parseMorningTime('08:40:00'), 520)
    assert.equal(publicInfoUrl('javascript:alert(1)'), undefined)
    assert.equal(publicInfoUrl('https://example.com/apply'), 'https://example.com/apply')
  })
})

describe('기존 시간표에 아침돌봄 연결', () => {
  it('요일을 명시 선택해야 기존 care 종류의 계획을 만들고 참여를 확정하지 않는다', () => {
    const info = morningCareFromLegacy(care)
    assert.equal(morningCareEntry(care.school_id, info, []), null)
    const entry = morningCareEntry(care.school_id, info, [3, 1, 3])!
    assert.deepEqual(entry.weekdays, [1, 3])
    assert.equal(entry.kind, 'care')
    assert.equal(entry.start, 450)
    assert.equal(entry.end, 520)
    assert.equal(entry.startsAfterSchool, undefined)
    assert.equal(entry.participation, 'planned')
    assert.equal(entry.evidence, 'estimated')
    assert.equal(entry.transitionIn, 'unknown')
    assert.equal(entry.term, 'semester')
    assert.equal(isMorningCareEntry(entry), true)
    assert.match(entry.source!.version, /2025.*QA 운영계획.*요일 사용자 선택/)
  })
  it('A의 명시 상태를 받을 수 있고 미운영·미확인에는 시각이 있어도 일정을 만들지 않는다', () => {
    const info = { ...unknownMorningCare(), startTime: '07:30', endTime: '08:40' }
    assert.equal(morningCareEntry('S1', info, [1]), null)
    assert.equal(morningCareEntry('S1', { ...info, status: 'not_operating' }, [1]), null)
    assert.equal(morningCareEntry('S1', { ...info, status: 'operating' }, [1])?.evidence, 'school-plan')
  })
})
