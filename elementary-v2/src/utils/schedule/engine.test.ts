// 실행: npm run test:unit  (Node가 타입을 걷어 내고 바로 돌린다. 브라우저 번들에는 들어가지 않는다)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SchoolCareHours, SchoolDayEstimate } from '../../types'
import type { ScheduleEntry } from './types'
import { computeDay, computeWeek } from './engine.ts'
import { careEntriesFromHours, formatMinutes, schoolEntriesFromEstimate, toMinutes } from './fromSchoolData.ts'

const t = (value: string) => {
  const minutes = toMinutes(value)
  if (minutes === null) throw new Error(`bad time ${value}`)
  return minutes
}

// 반안초(B000002704) 운영 값과 같은 모양: 월·수·목 5교시 13:40, 화·금 4교시 13:00.
const estimate: SchoolDayEstimate = {
  school_id: 'B000002704',
  source_year: 2026,
  applies_to_entry_year: 2027,
  lunch_position: 'after_p4',
  lunch_start: '12:10:00',
  lunch_end: '13:00:00',
  clock_source: '학교알리미 2-가',
  periods_source: 'NEIS 2026',
  reviewed_on: '2026-10-07',
  weekdays: [
    { weekday: 1, periods: 5, dismissal: '13:40:00', note: null },
    { weekday: 2, periods: 4, dismissal: '13:00:00', note: null },
    { weekday: 3, periods: 5, dismissal: '13:40:00', note: null },
    { weekday: 4, periods: 5, dismissal: '13:40:00', note: 'inferred' },
    { weekday: 5, periods: null, dismissal: null, note: 'school_check_needed' },
  ],
}

const care: SchoolCareHours = {
  school_id: 'B000002704',
  source_year: 2026,
  status: 'stated',
  afternoon_end: '17:00',
  extended_end: '19:00',
  extended_condition: '최소 1실 희망 시',
  morning_hours: '07:30~08:40',
  grades: '1~2학년',
  source: '학교알리미 15-라',
}

const school = schoolEntriesFromEstimate(estimate)
const untilSix = { from: 'dismissal' as const, to: t('18:00') }

const entry = (overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'id' | 'kind'>): ScheduleEntry => ({
  label: overrides.id,
  weekdays: [1, 2, 3, 4, 5],
  start: null,
  end: null,
  evidence: 'confirmed',
  participation: 'confirmed',
  ...overrides,
})

describe('school data → entries', () => {
  it('reads PostgREST times and refuses to guess', () => {
    assert.equal(toMinutes('13:40:00'), 820)
    assert.equal(toMinutes('7:30'), 450)
    assert.equal(toMinutes('방과후'), null)
    assert.equal(toMinutes('25:00'), null)
    assert.equal(formatMinutes(820), '13:40')
  })

  it('marks every published dismissal as estimated and a school-check day as unknown', () => {
    assert.deepEqual(school.map((item) => [item.weekdays[0], item.end, item.evidence]), [
      [1, 820, 'estimated'], [2, 780, 'estimated'], [3, 820, 'estimated'], [4, 820, 'estimated'], [5, null, 'unknown'],
    ])
  })

  it('splits afternoon and extended care, and leaves unknown hours unknown', () => {
    const entries = careEntriesFromHours(care)
    assert.deepEqual(entries.map((item) => [item.label, item.start, item.end, item.participation]), [
      ['오후 돌봄', null, 1020, 'considering'],
      ['저녁·연장 돌봄', 1020, 1140, 'considering'],
    ])
    const unknown = careEntriesFromHours({ ...care, status: 'school_check_needed' })
    assert.equal(unknown.length, 1)
    assert.equal(unknown[0].evidence, 'unknown')
  })
})

describe('computeDay', () => {
  it('leaves the whole afternoon open when care is only being considered', () => {
    const day = computeDay([...school, ...careEntriesFromHours(care)], 1, untilSix)
    assert.equal(day.blocks.length, 1) // 정규수업만 들어간다
    assert.equal(day.candidates.length, 2)
    assert.deepEqual(day.gaps, [{ from: 820, to: 1080, minutes: 260, status: 'estimated' }])
  })

  it('treats school end and care start at the same minute as a hand-off, not an overlap', () => {
    const entries = [...school, ...careEntriesFromHours(care, { afternoon: 'applying' })]
    const day = computeDay(entries, 1, untilSix)
    assert.equal(day.overlaps.length, 0)
    assert.equal(day.transitions.length, 0) // 돌봄교실 이동은 학교 안이라 confirmed
    assert.deepEqual(day.gaps, [{ from: 1020, to: 1080, minutes: 60, status: 'estimated' }])
    assert.equal(day.blocks[1].tentative, true)
  })

  it('follows each weekday’s own dismissal (4교시 days end earlier)', () => {
    const week = computeWeek([...school, ...careEntriesFromHours(care, { afternoon: 'confirmed' })], untilSix)
    assert.equal(week[0].blocks[1].start, 820)
    assert.equal(week[1].blocks[1].start, 780) // 화 13:00부터 돌봄
  })

  it('does not count gap minutes from an unknown dismissal', () => {
    const day = computeDay([...school, ...careEntriesFromHours(care, { afternoon: 'confirmed' })], 5, untilSix)
    assert.equal(day.window, null)
    assert.equal(day.gapsUndetermined, 'dismissal_unknown')
    assert.deepEqual(day.gaps, [])
    assert.deepEqual(day.unplaced.map((item) => item.reason), ['dismissal_unknown', 'dismissal_unknown'])
  })

  it('applies a shortened day to both the school block and the window', () => {
    const day = computeDay(school, 1, untilSix, { dismissalOverride: t('12:10') })
    assert.equal(day.dismissal.at, 730)
    assert.equal(day.blocks[0].end, 730)
    assert.equal(day.gaps[0].from, 730)
  })

  it('drops term-time entries on a vacation day and keeps vacation care', () => {
    const vacationCare = entry({ id: 'vacation-care', kind: 'care', start: t('09:00'), end: t('13:00'), term: 'vacation', evidence: 'school-plan' })
    const entries = [...school, ...careEntriesFromHours(care, { afternoon: 'confirmed' }), vacationCare]
    const fromDismissal = computeDay(entries, 1, untilSix, { vacation: true })
    assert.equal(fromDismissal.gapsUndetermined, 'no_school_day')
    const fromNine = computeDay(entries, 1, { from: t('09:00'), to: t('18:00') }, { vacation: true })
    assert.deepEqual(fromNine.blocks.map((block) => block.entry.id), ['vacation-care'])
    assert.deepEqual(fromNine.gaps, [{ from: 780, to: 1080, minutes: 300, status: 'confirmed' }])
  })

  it('tells an after-school class inside care apart from a real clash', () => {
    const afterschool = entry({ id: 'afterschool-art', kind: 'afterschool', start: t('14:00'), end: t('15:00'), weekdays: [1] })
    const academy = entry({ id: 'academy', kind: 'personal', start: t('14:30'), end: t('15:30'), weekdays: [1] })
    const day = computeDay([...school, ...careEntriesFromHours(care, { afternoon: 'confirmed' }), afterschool, academy], 1, untilSix)
    assert.deepEqual(day.overlaps.map((overlap) => [overlap.a.entry.id, overlap.b.entry.id, overlap.type]).sort(), [
      ['afterschool-art', 'academy', 'conflict'],
      ['care-B000002704-afternoon', 'academy', 'conflict'],
      ['care-B000002704-afternoon', 'afterschool-art', 'care_afterschool'],
    ].sort())
  })

  it('drops a rejected application from the plan but keeps it visible', () => {
    const rejected = entry({ id: 'afterschool-rejected', kind: 'afterschool', start: t('13:40'), end: t('14:40'), participation: 'rejected' })
    const day = computeDay([...school, rejected], 1, untilSix)
    assert.deepEqual(day.excluded.map((item) => item.id), ['afterschool-rejected'])
    assert.equal(day.gaps[0].from, 820)
  })

  it('flags an unchecked or forbidden hand-off between back-to-back entries', () => {
    const afterschool = entry({ id: 'afterschool', kind: 'afterschool', start: t('13:40'), end: t('14:40'), weekdays: [1], transitionIn: 'confirmed' })
    const academy = entry({ id: 'academy', kind: 'personal', start: t('14:40'), end: t('15:40'), weekdays: [1] })
    const day = computeDay([...school, afterschool, academy], 1, untilSix)
    assert.deepEqual(day.transitions.map((item) => [item.from.entry.id, item.to.entry.id, item.rule]), [['afterschool', 'academy', 'unknown']])
    const forbidden = computeDay([...school, afterschool, { ...academy, transitionIn: 'prohibited' }], 1, untilSix)
    assert.equal(forbidden.transitions[0].rule, 'prohibited')
  })

  it('calls a gap confirmed only when both of its edges are confirmed', () => {
    const lesson = entry({ id: 'lesson', kind: 'personal', start: t('15:00'), end: t('16:00') })
    const day = computeDay([lesson], 1, { from: t('14:00'), to: t('18:00') })
    assert.deepEqual(day.gaps.map((gap) => [formatMinutes(gap.from), formatMinutes(gap.to), gap.status]), [
      ['14:00', '15:00', 'confirmed'], ['16:00', '18:00', 'confirmed'],
    ])
    const planned = computeDay([{ ...lesson, participation: 'planned' }], 1, { from: t('14:00'), to: t('18:00') })
    assert.deepEqual(planned.gaps.map((gap) => gap.status), ['estimated', 'estimated'])
  })

  it('marks gaps uncertain while an entry the child attends has no time yet', () => {
    const noTime = entry({ id: 'taekwondo', kind: 'personal' })
    const day = computeDay([...school, noTime], 1, untilSix)
    assert.deepEqual(day.unplaced.map((item) => [item.entry.id, item.reason]), [['taekwondo', 'time_unknown']])
    assert.equal(day.gaps[0].status, 'uncertain')
  })

  it('does not report morning care as a clash with lessons', () => {
    const morning = entry({ id: 'morning-care', kind: 'care', start: t('07:30'), end: t('08:40') })
    const day = computeDay([...school, morning], 1, untilSix)
    assert.equal(day.overlaps.length, 0)
  })

  it('returns no gaps when care covers the whole window', () => {
    const day = computeDay([...school, ...careEntriesFromHours(care, { afternoon: 'confirmed' })], 1, { from: 'dismissal', to: t('17:00') })
    assert.deepEqual(day.gaps, [])
    assert.equal(day.gapsUndetermined, null)
  })
})
