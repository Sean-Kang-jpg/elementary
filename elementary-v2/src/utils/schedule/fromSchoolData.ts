import type { SchoolAfterschoolOption, SchoolAfterschoolSection, SchoolCareHours, SchoolDayEstimate } from '../../types'
import type { EvidenceStatus, Minutes, ParticipationStatus, ScheduleEntry, Weekday } from './types'

/** 'HH:MM' 또는 PostgREST의 'HH:MM:SS'. 읽을 수 없으면 null — 추측하지 않는다. */
export const toMinutes = (value: string | null | undefined): Minutes | null => {
  const match = value?.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export const formatMinutes = (value: Minutes): string =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

/**
 * 학교 상세 카드의 요일별 예상 하교(SQL 26)를 요일마다 하나씩 정규수업 일정으로 바꾼다.
 * 시작 시각은 자료에 없으므로 null이다 — 엔진은 하교 뒤 오후 구간만 계산한다.
 * 전년도 공시 값이라 전부 estimated이고, 학교 확인이 필요한 요일은 끝 시각도 모른다.
 */
export const schoolEntriesFromEstimate = (estimate: SchoolDayEstimate): ScheduleEntry[] =>
  estimate.weekdays.map((day) => {
    const end = day.note === 'school_check_needed' ? null : toMinutes(day.dismissal)
    return {
      id: `school-${estimate.school_id}-${day.weekday}`,
      kind: 'school',
      label: day.periods ? `정규수업 ${day.periods}교시` : '정규수업',
      weekdays: [day.weekday],
      start: null,
      end,
      evidence: end === null ? 'unknown' : 'estimated',
      participation: 'confirmed',
      term: 'semester',
      source: { ref: `school_day_estimates:${estimate.school_id}`, version: `${estimate.source_year}/${estimate.reviewed_on}` },
    }
  })

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]

/**
 * 학교 돌봄 운영 시간을 후보 일정으로 바꾼다. 기본(오후)과 저녁·연장은 따로 신청·선발되므로
 * 별개 일정이다(2026-10-08 사용자 결정). 둘 다 '방과후'부터 시작한다.
 * 참여 상태는 부모가 고른다 — 기본값 considering은 점유 시간에 들어가지 않는다.
 */
export const careEntriesFromHours = (
  care: SchoolCareHours,
  participation: { afternoon?: ParticipationStatus; extended?: ParticipationStatus } = {},
): ScheduleEntry[] => {
  const evidence: EvidenceStatus = care.status === 'stated' ? 'estimated' : 'unknown'
  const afternoonEnd = care.status === 'stated' ? toMinutes(care.afternoon_end) : null
  const extendedEnd = care.status === 'stated' ? toMinutes(care.extended_end) : null
  const source = { ref: `school_care_hours:${care.school_id}`, version: String(care.source_year) }
  const entries: ScheduleEntry[] = [{
    id: `care-${care.school_id}-afternoon`,
    kind: 'care',
    label: '오후 돌봄',
    weekdays: ALL_WEEKDAYS,
    start: null,
    startsAfterSchool: true,
    end: afternoonEnd,
    evidence: afternoonEnd === null ? 'unknown' : evidence,
    participation: participation.afternoon ?? 'considering',
    transitionIn: 'confirmed',
    term: 'semester',
    source,
  }]
  if (extendedEnd !== null && afternoonEnd !== null && extendedEnd > afternoonEnd) {
    entries.push({
      id: `care-${care.school_id}-extended`,
      kind: 'care',
      label: '저녁·연장 돌봄',
      weekdays: ALL_WEEKDAYS,
      start: afternoonEnd,
      end: extendedEnd,
      evidence,
      participation: participation.extended ?? 'considering',
      transitionIn: 'confirmed',
      term: 'semester',
      source,
    })
  }
  return entries
}

const WEEKDAY_LETTERS = '월화수목금'

/** 방과후 강좌의 반 하나를 가리키는 이름. 같은 반을 두 번 넣지 않도록 id에도 쓴다. */
export const afterschoolSectionLabel = (option: SchoolAfterschoolOption, section: SchoolAfterschoolSection): string =>
  `${option.kind === '맞춤형' ? '맞춤형 ' : ''}${option.name}${option.variant ? ` (${option.variant})` : ''}${section.section ? ` · ${section.section}` : ''}`

export const afterschoolSectionId = (schoolId: string, option: SchoolAfterschoolOption, section: SchoolAfterschoolSection): string =>
  `afterschool-${schoolId}-${afterschoolSectionLabel(option, section)}-${section.days ?? ''}-${section.start ?? ''}-${section.end ?? ''}`

/**
 * 방과후·맞춤형 강좌의 반 하나(SQL 30, 15-라 운영계획)를 일정으로 바꾼다.
 * 요일을 모르면 null이다 — 일정은 요일이 있어야 하므로 부모가 요일을 직접 고르게 한다.
 * 운영계획 값이라 시작·종료를 모두 읽은 반만 school-plan이다. 기본은 후보,
 * MY에서 명시적으로 고른 반은 planned로 전달하며 실제 참여 확정은 따로 고른다.
 */
export const afterschoolEntryFromSection = (
  schoolId: string,
  sourceYear: number,
  option: SchoolAfterschoolOption,
  section: SchoolAfterschoolSection,
  participation: ParticipationStatus = 'considering',
): ScheduleEntry | null => {
  const weekdays = [...new Set(section.days ?? '')]
    .map((letter) => WEEKDAY_LETTERS.indexOf(letter) + 1)
    .filter((day): day is Weekday => day >= 1)
    .sort()
  if (!weekdays.length) return null
  let start = toMinutes(section.start)
  let end = toMinutes(section.end)
  if (start !== null && end !== null && start >= end) start = end = null
  return {
    id: afterschoolSectionId(schoolId, option, section),
    kind: 'afterschool',
    label: afterschoolSectionLabel(option, section),
    weekdays,
    start,
    end,
    evidence: start !== null && end !== null ? 'school-plan' : 'unknown',
    participation,
    transitionIn: 'unknown',
    term: 'semester',
    source: { ref: `school_afterschool:${schoolId}`, version: `${sourceYear} 운영계획` },
  }
}
