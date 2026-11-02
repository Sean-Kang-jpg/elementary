import type { ReactNode } from 'react'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import { describeCoverage, type WeekCoverage } from '../../utils/schedule/coverage'
import { RETURN_OPTIONS, starterStep, type ReturnAt, type StarterAnswers } from '../../utils/schedule/starter'
import type { ScheduleEntry } from '../../utils/schedule/types'

const STEP_NUMBER = { return: 1, care: 2, courses: 3, fill: 4, done: 4 } as const

/**
 * 출발 계획 질문 카드(UX-13). 한 번에 한 질문만 보이고, 답하면 아래 시간표가 바로 바뀐다.
 * 저장과 자료 읽기는 MySchedule이 한다 — 여기서는 지금 단계의 질문과 버튼만 그린다.
 */
export default function PlanStarter({ answers, suggested, busy, careDraft, evening, eveningAdded, coverage, picker, onReturn, onCare, onCourses, onCoursesNext, onEvening, onDone }: {
  answers: StarterAnswers | undefined
  /** 다른 학교에서 고른 귀가 시각. 미리 눌러 두지 않고 표시만 한다. */
  suggested: ReturnAt | null
  busy: boolean
  /** 2단계 '예'를 누르면 들어갈 오후 돌봄(설명에 쓴다). */
  careDraft: ScheduleEntry | null
  /** 4단계에서 권할 저녁·연장 돌봄. 학교 공시가 있을 때만. */
  evening: ScheduleEntry | null
  eveningAdded: boolean
  coverage: WeekCoverage | null
  /** 3단계 '예' 뒤의 과목 고르기. 있으면 질문 대신 이것과 '다음'을 보인다. */
  picker: ReactNode
  onReturn: (returnAt: ReturnAt) => void
  onCare: (yes: boolean) => void
  onCourses: (yes: boolean) => void
  onCoursesNext: () => void
  onEvening: () => void
  onDone: () => void
}) {
  const step = starterStep(answers)
  if (step === 'done') return null
  const returnAt = typeof answers?.returnAt === 'number' ? answers.returnAt : null
  const until = returnAt === null ? '' : `${Math.floor(returnAt / 60)}시`

  return <section className="plan-starter my-card" aria-labelledby="plan-starter-title" data-testid="plan-starter" data-step={step}>
    <p className="plan-starter__count">질문 {STEP_NUMBER[step]} / 4</p>
    {step === 'return' && <>
      <h3 id="plan-starter-title">평일에 보호자가 집에 오는 시각은 언제쯤인가요?</h3>
      <p className="my-help">답할 때마다 아래 시간표가 채워져요. 나중에 언제든 바꿀 수 있어요.</p>
      <div className="plan-starter__choices">
        {RETURN_OPTIONS.map((option) => <button key={option.value} type="button" className="my-button" disabled={busy} onClick={() => onReturn(option.value)}>
          {option.label}{suggested === option.value && <small> · 지난번 선택</small>}
        </button>)}
      </div>
      {busy && <p className="my-help" role="status">학교 자료 확인 중…</p>}
    </>}
    {step === 'care' && <>
      <h3 id="plan-starter-title">하교 뒤 학교 돌봄을 신청할 예정인가요?</h3>
      <p className="my-help">
        {careDraft?.end != null && `하교부터 ${formatMinutes(careDraft.end)}까지 돌봄으로 채워요`}
        {careDraft?.timeAssumption ? ` (${careDraft.timeAssumption})` : careDraft?.end != null ? ' (학교 공시)' : ''}. 신청·선발은 학교에서 따로 해요.
      </p>
      <div className="plan-starter__choices">
        <button type="button" className="my-button my-button--primary" onClick={() => onCare(true)}>예, 신청할 예정이에요</button>
        <button type="button" className="my-button" onClick={() => onCare(false)}>아니요</button>
      </div>
    </>}
    {step === 'courses' && (picker ? <>
      <h3 id="plan-starter-title">들을 수업을 골라 주세요</h3>
      {picker}
      <div className="plan-starter__choices">
        <button type="button" className="my-button my-button--primary" onClick={onCoursesNext}>다음</button>
      </div>
    </> : <>
      <h3 id="plan-starter-title">{answers?.care
        ? '맞춤형·방과후 수업도 들을 건가요?'
        : returnAt === 900 ? '맞춤형·방과후 수업만으로 15시까지 채울까요?' : '맞춤형·방과후 수업을 들을 건가요?'}</h3>
      <p className="my-help">{answers?.care
        ? '돌봄 시간에 수업을 함께 들을 수 있는지는 학교마다 달라요. 학교에 확인해 주세요.'
        : '학교 운영계획에 있는 1학년 강좌에서 고를 수 있어요.'}</p>
      <div className="plan-starter__choices">
        <button type="button" className="my-button my-button--primary" onClick={() => onCourses(true)}>예, 고를게요</button>
        <button type="button" className="my-button" onClick={() => onCourses(false)}>아니요</button>
      </div>
    </>)}
    {step === 'fill' && <>
      <h3 id="plan-starter-title">{coverage?.state === 'covered' ? `${until}까지 다 채웠어요` : `${until}까지 남은 빈 시간`}</h3>
      {coverage && <p className={`plan-coverage plan-coverage--${coverage.state}`}>{describeCoverage(coverage)}</p>}
      {coverage?.state !== 'covered' && <p className="my-help">아래 시간표에서 빈칸을 눌러 학원이나 다른 수업을 넣어요.</p>}
      {evening && !eveningAdded && <button type="button" className="my-button" onClick={onEvening}>
        저녁 돌봄 넣기 · {formatMinutes(evening.start!)}–{formatMinutes(evening.end!)} (학교 공시)
      </button>}
      <div className="plan-starter__choices">
        <button type="button" className="my-button my-button--primary" onClick={onDone}>다 됐어요</button>
      </div>
    </>}
  </section>
}
