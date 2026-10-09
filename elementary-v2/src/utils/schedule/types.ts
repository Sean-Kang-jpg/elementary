/**
 * 초1 시간표 엔진의 상태 타입 (Audit 2 §6.1, A2-S01).
 *
 * 세 축은 서로 독립이다. 하나의 신뢰 점수로 합치지 않는다 — 정규수업이 confirmed여도
 * 하교 시각은 estimated일 수 있고, 학교가 돌봄을 연다는 사실(evidence)과 우리 아이가
 * 붙었다는 사실(participation)은 다른 질문이다.
 */

/** 시간표가 어느 시기의 것인가. 날짜가 왔다고 자동으로 넘기지 않는다. */
export type ScheduleMode = 'planning' | 'application' | 'actual'

/** 이 시각을 무엇으로 아는가. 필드마다 따로 둔다. */
export type EvidenceStatus = 'confirmed' | 'school-plan' | 'estimated' | 'unknown'

/** 이 프로그램에 우리 아이가 어디까지 왔는가. */
export type ParticipationStatus = 'considering' | 'planned' | 'applying' | 'confirmed' | 'rejected' | 'cancelled'

/** 앞 일정에서 이 일정으로 바로 넘어갈 수 있는가 (예: 하교 → 돌봄교실 이동). */
export type TransitionRule = 'confirmed' | 'prohibited' | 'unknown'

export type EntryKind = 'school' | 'afterschool' | 'care' | 'personal'

/** 1 = 월 … 5 = 금. 주말은 이번 범위 밖이다. */
export type Weekday = 1 | 2 | 3 | 4 | 5

/** 자정부터 센 분. 09:00 = 540. */
export type Minutes = number

/** 학기 중에만, 방학에만, 둘 다. 방학 돌봄은 방학 문서가 있을 때만 만든다. */
export type ActiveTerm = 'semester' | 'vacation' | 'both'

export interface ScheduleEntry {
  id: string
  kind: EntryKind
  label: string
  weekdays: Weekday[]
  /** null이면 시각을 모른다. 모르는 시각으로 공백 분을 계산하지 않는다. */
  start: Minutes | null
  end: Minutes | null
  /** start가 앞 일정의 끝을 따라간다(돌봄은 '방과후'부터). start보다 우선한다. */
  startsAfterSchool?: boolean
  evidence: EvidenceStatus
  /** 학교 정규수업은 참여 여부를 묻지 않으므로 'confirmed'로 둔다. */
  participation: ParticipationStatus
  /** 이 일정 직전 일정에서 넘어오는 규칙. 없으면 unknown으로 본다. */
  transitionIn?: TransitionRule
  term?: ActiveTerm
  /** 어디서 왔나. 새 자료가 와도 사용자 수정을 덮지 않도록 출처와 판을 남긴다. */
  source?: { ref: string; version: string }
}

/** 부모가 정한 오후 구간. 하루 전체를 빈칸으로 채우지 않는다(§6.2). */
export interface PlanningWindow {
  /** 'dismissal'이면 그날의 하교 시각에서 시작한다. */
  from: 'dismissal' | Minutes
  /** 보호자가 아이를 맡을 수 있는 시각. */
  to: Minutes
}

/** 날짜 단위로 기본 주간표를 덮는 것. 반복 일정의 일회 취소·보강은 S03에서 다룬다. */
export interface DayContext {
  /** 방학·휴업일. 학기 중 일정이 빠진다. */
  vacation?: boolean
  /** 단축수업 등으로 이날만 하교가 다르다. */
  dismissalOverride?: Minutes
}
