import { useEffect, useState } from 'react'
import { getSchoolDayEstimate, getSchoolAfterschool } from '../../services/dataService'
import { formatMinutes, schoolEntriesFromEstimate } from '../../utils/schedule/fromSchoolData'
import { deletePlan, readPlans, subscribePlans, upsertPlan, writePlans, type PlanStore, type SchoolPlan } from '../../utils/schedule/plans'
import type { EntryKind, ParticipationStatus, ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { displaySchoolName } from '../../utils/schoolName'
import MyScheduleDay from './MyScheduleDay'
import MyScheduleWeek from './MyScheduleWeek'
import SchoolChecks from './SchoolChecks'
import { applyCalendarChange, type CalendarChange } from '../../utils/schedule/editing'
import { toggleProgramDay } from '../../utils/schedule/programSelection'
import { describeCoverage, firstGapSlot, planCoverage } from '../../utils/schedule/coverage'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { frontyardPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import { removeEntryDay, repeatEntry, setEntryTimes } from '../../utils/schedule/dayTimes'
import { afternoonCareFor, answerReturn, coverageUntil, emptyStarter, eveningCareFor, starterCareIds, starterStep, answerStarterDismissal, hasScheduleDismissal, skipStarterCourses, starterHasSlots, type DismissalAnswer, type ReturnAt, type StarterAnswers } from '../../utils/schedule/starter'
import type { SchoolAfterschool } from '../../types'
import PlanStarter from './PlanStarter'
import MyAfterschoolPicker from './MyAfterschoolPicker'
import { describeIntents, weekIntentMinutes } from '../../utils/schedule/intent'
import { computeWeek } from '../../utils/schedule/engine'
import { CALENDAR_END } from '../../utils/schedule/calendar'
import { funnelMeasurement } from '../../utils/analytics'
import { timetableContentChanged } from '../../utils/funnelMeasurement'

import { UNSPECIFIED_SCHOOL } from '../../utils/schedule/standalone'
const RETURN_ANSWERS = { 900: '15:00', 1020: '17:00', 1140: '19:00', dismissal: 'dismissal' } as const

const DAYS = ['월', '화', '수', '목', '금']
const STATUS: Record<ParticipationStatus, string> = {
  considering: '후보', planned: '계획에 포함', applying: '신청 중',
  confirmed: '참여 확정', rejected: '미선정', cancelled: '취소',
}
const SOURCES: Record<EntryKind, string> = { school: '학교별 예상 하교 자료', afterschool: '학교 방과후 운영계획', care: '학교 돌봄 운영 시간 자료', personal: '사용자 입력' }
const timing = (e: ScheduleEntry) => e.kind === 'school'
  ? `하교 ${e.end === null ? '미확인' : formatMinutes(e.end) + ' (예상)'}`
  : `${e.startsAfterSchool ? '하교 후' : e.start === null ? '시작 미확인' : formatMinutes(e.start)} ~ ${e.end === null ? '종료 미확인' : formatMinutes(e.end)}`

/**
 * 한 학교의 시간표 초안을 만들고 고친다. 학교는 우리집 일정의 한 주 화면(`/timetable`)이 고른다 —
 * 2026-10-19부터 관심 학교로 저장하지 않아도 짤 수 있다.
 * 2026-11-02부터 빈 초안으로 시작하지 않는다: 출발 계획 질문(UX-13, PlanStarter)에 답하며 채운다.
 */
export default function MySchedule({ school, entryYear, saved, onNavigate, pickupFocus }: {
  /** displayName은 화면 표기(광역시 접두 생략)용. 초안에는 공식 이름을 저장한다. */
  school: { id: string; name: string; displayName?: string }
  entryYear: number | null
  /** 관심 학교로 저장한 학교인지. 저장과 시간표는 별개라 안내만 달라진다. */
  saved: boolean
  /** 빈 시간에서 학교앞마당으로 넘어갈 때 쓴다. 없으면 그 버튼을 그리지 않는다. */
  onNavigate?: (path: string) => void
  pickupFocus?: { weekday: Weekday } | null
}) {
  const [store, setStore] = useState(readPlans)
  const [message, setMessage] = useState('')
  const [reviewEntry, setReviewEntry] = useState<{ id: string; weekday: Weekday } | null>(null)
  const [dayData, setDayData] = useState<Awaited<ReturnType<typeof getSchoolDayEstimate>> | null>()
  const [courseData, setCourseData] = useState<SchoolAfterschool | null>()
  const [courseFailed, setCourseFailed] = useState(false)
  const [courseRetry, setCourseRetry] = useState(0)
  const [editingDismissal, setEditingDismissal] = useState(false)
  const [withoutDayData, setWithoutDayData] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [picking, setPicking] = useState(false)
  useEffect(() => subscribePlans(() => setStore(readPlans())), [])
  const schoolId = school.id
  const plan = store.plans.find((p) => p.schoolId === schoolId)
  const manual = schoolId === UNSPECIFIED_SCHOOL
  useEffect(() => {
    if (manual) return
    let active = true
    getSchoolDayEstimate(schoolId, { allowDevFixture: false })
      .then((data) => { if (active) setDayData(data) })
      .catch(() => { if (active) setDayData(null) })
    return () => { active = false }
  }, [schoolId, manual])
  useEffect(() => {
    if (manual) return
    let active = true
    getSchoolAfterschool(schoolId, { allowDevFixture: false })
      .then((data) => { if (active) setCourseData(data) })
      .catch(() => { if (active) setCourseFailed(true) })
    return () => { active = false }
  }, [schoolId, manual, courseRetry])

  const availableEntries = dayData?.day ? schoolEntriesFromEstimate(dayData.day) : []
  const publicEntries = withoutDayData ? [] : availableEntries
  const publicSource = `school_day_estimates:${schoolId}`
  const storedDismissal = hasScheduleDismissal(plan?.entries.filter((entry) => entry.source?.ref === publicSource) ?? [])
  const hasDismissal = hasScheduleDismissal(availableEntries) || storedDismissal
  const context = { needsDismissal: !(hasScheduleDismissal(publicEntries) || storedDismissal) }
  const hasSlots = starterHasSlots(courseData)
  const step = manual || (plan && !plan.starter) ? 'done' : editingDismissal ? 'dismissal' : starterStep(plan?.starter, context)
  useEffect(() => {
    if (step !== 'return') return
    // Let the enclosing timetable record the displayed screen and its entry point first.
    let active = true
    queueMicrotask(() => { if (active) funnelMeasurement.timetableStep(schoolId, { step: 'return', answer: 'start' }) })
    return () => { active = false }
  }, [schoolId, step])

  const pendingManual = !manual && store.plans.some((item) => item.schoolId === UNSPECIFIED_SCHOOL)
  // Move the standalone draft in the same successful write as the school draft.
  const withManualEntries = (current: PlanStore, next: SchoolPlan) => {
    const standalone = current.plans.find((item) => item.schoolId === UNSPECIFIED_SCHOOL)
    if (!standalone || manual) return upsertPlan(current, next)
    const entries = [...next.entries, ...standalone.entries.filter((entry) => !next.entries.some((item) => item.id === entry.id))]
    return upsertPlan(deletePlan(current, UNSPECIFIED_SCHOOL), { ...next, entries })
  }
  const persist = (next: PlanStore, success: string, operation: 'create' | 'edit' | 'delete' = 'edit') => {
    const before = readPlans()
    const previous = before.plans.find(p => p.schoolId === schoolId)
    const movedManual = before.plans.length > next.plans.length
    const updated = next.plans.find(p => p.schoolId === schoolId)
    setSaveFailed(false)
    if (operation === 'edit' && previous && updated && !movedManual && !timetableContentChanged(previous, updated)) {
      setMessage(success)
      return true
    }
    // Older completed drafts have only starter.done. Preserve that history
    // when restarting the questions, in the same write as the new answers.
    const wasCompleted = previous?.starterCompleted === true || previous?.starter?.done === true
    const firstCompletion = updated?.starter?.done === true && !wasCompleted
    const stored = updated && (wasCompleted || firstCompletion) && !updated.starterCompleted
      ? upsertPlan(next, { ...updated, starterCompleted: true })
      : next
    try {
      if (operation === 'delete') writePlans(stored)
      else funnelMeasurement.write(schoolId, operation, () => writePlans(stored))
      if (firstCompletion) {
        const until = coverageUntil(updated.starter)
        funnelMeasurement.timetableComplete(schoolId, {
          coverageState: until === null ? 'covered' : planCoverage(updated.entries, until).state,
          hasDismissal, hasSlots,
        })
      }
      setStore(stored); setMessage(success); return true
    }
    catch { setSaveFailed(true); setMessage('저장하지 못했어요. 브라우저 저장 공간·설정을 확인해 주세요. 변경 내용은 저장되지 않았어요.'); return false }
  }
  const updatePlan = (next: SchoolPlan) => persist(upsertPlan(readPlans(), { ...next, updatedAt: new Date().toISOString() }), '시간표 초안을 저장했어요.')
  const changeEntries = (change: (entries: ScheduleEntry[]) => ScheduleEntry[]) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    return latest ? updatePlan({ ...latest, entries: change(latest.entries) }) : false
  }
  /** 바꿀 수 없으면 null을 돌려주는 변경. 저장하지 않고 false로 끝난다. */
  const changeEntriesIf = (change: (entries: ScheduleEntry[]) => ScheduleEntry[] | null) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    const next = latest && change(latest.entries)
    return next ? updatePlan({ ...latest, entries: next }) : false
  }
  const addEntry = (entry: ScheduleEntry) => changeEntries((entries) => [...entries.filter((e) => e.id !== entry.id), entry])
  const removeEntry = (id: string) => changeEntries((entries) => entries.filter((e) => e.id !== id))
  const saveCalendarEntry = (change: CalendarChange): ScheduleEntry | null => {
    const current = readPlans()
    const latest = current.plans.find((p) => p.schoolId === schoolId)
    if (!latest && !manual) { setMessage('초안이 변경됐어요. 학교를 다시 선택해 주세요.'); return null }
    const result = applyCalendarChange(latest?.entries ?? [], change, crypto.randomUUID())
    if (!result.ok) { setMessage(result.reason === 'stale' ? '다른 탭에서 일정이 바뀌었어요. 다시 열어 주세요.' : '직접 입력한 일정의 이름·요일·시간을 확인해 주세요.'); return null }
    const next = { schoolId, schoolName: school.name, entryYear, ...latest, entries: result.entries, updatedAt: new Date().toISOString() }
    return persist(upsertPlan(current, next), '시간표 초안을 저장했어요.', latest ? 'edit' : 'create') ? result.entry : null
  }
  const careHours = withoutDayData ? null : dayData?.care ?? null
  const setStarter = (answers: StarterAnswers, change: (entries: ScheduleEntry[]) => ScheduleEntry[] = (entries) => entries) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    return latest ? updatePlan({ ...latest, starter: answers, entries: change(latest.entries) }) : false
  }
  const keepCare = (entry: ScheduleEntry) => !starterCareIds(schoolId).includes(entry.id)
    || Boolean(entry.userOverride || entry.dayTimes) || entry.weekdays.length !== 5 || !entry.source

  const start = (returnAt: ReturnAt) => {
    const current = readPlans()
    const latest = current.plans.find((item) => item.schoolId === schoolId)
    const starter = { ...answerReturn(returnAt, context), ...(latest?.starter?.dismissal && { dismissal: latest.starter.dismissal }) }
    // A previously answered dismissal is still enough for the immediate pickup branch.
    if (returnAt === 'dismissal' && starter.dismissal) starter.done = true
    const entryById = new Map(publicEntries.map((entry) => [entry.id, entry]))
    latest?.entries.forEach((entry) => entryById.set(entry.id, entry))
    const entries = [...entryById.values()].filter((entry) => returnAt !== 'dismissal' || keepCare(entry))
    funnelMeasurement.timetableStep(schoolId, { step: 'return', answer: RETURN_ANSWERS[returnAt] })
    persist(withManualEntries(current, { schoolId, schoolName: school.name, entryYear, ...latest, entries, starter, updatedAt: new Date().toISOString() }),
      '시간표 초안을 저장했어요.', latest ? 'edit' : 'create')
  }
  const answerDismissal = (answer: DismissalAnswer) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    if (!latest?.starter) return
    const { default: choice, weekdays } = answer
    funnelMeasurement.timetableStep(schoolId, { step: 'dismissal', answer: weekdays ? 'by_weekday' : choice === 'unknown' ? 'unknown' : choice === 770 ? '12:50' : choice === 820 ? '13:40' : '14:30' })
    if (updatePlan({ ...latest, ...answerStarterDismissal(schoolId, latest.starter, latest.entries, answer) })) setEditingDismissal(false)
  }
  const answerCare = (yes: boolean) => {
    const answers = plan?.starter
    if (!answers || typeof answers.returnAt !== 'number') return
    const entry = yes ? afternoonCareFor(schoolId, careHours, answers.returnAt) : null
    funnelMeasurement.timetableStep(schoolId, { step: 'care', answer: yes ? 'yes' : 'no' })
    setStarter({ ...answers, care: yes }, (entries) => {
      const kept = entries.filter(keepCare)
      return entry && !kept.some((item) => item.id === entry.id) ? [...kept, entry] : kept
    })
  }
  const answerCourses = (answer: 'yes' | 'no' | 'skip') => {
    if (!plan?.starter) return
    funnelMeasurement.timetableStep(schoolId, { step: 'courses', answer })
    if (answer === 'yes') { setPicking(true); return }
    setStarter(hasSlots === false ? skipStarterCourses(plan.starter, hasSlots) : { ...plan.starter, courses: false })
  }
  const returnAt = typeof plan?.starter?.returnAt === 'number' ? plan.starter.returnAt : null
  const evening = returnAt === null ? null : eveningCareFor(careHours, returnAt)
  // 다른 학교에서 고른 귀가 시각. 미리 눌러 두지는 않는다.
  const suggested = store.plans.filter((p) => p.schoolId !== schoolId && p.starter?.returnAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.starter?.returnAt ?? null
  const shownName = school.displayName ?? displaySchoolName(school.name)
  // 완료 표시(UX-10). 엔진의 공백 계산만 쓴다 — 하교부터 보호자 귀가(답이 없으면 19시)까지.
  const until = plan ? coverageUntil(plan.starter) : null
  // 칸의 의도별 시간(UX-14). 엔진이 배치한 칸만 센다.
  const week = plan ? computeWeek(plan.entries, { from: 'dismissal', to: CALENDAR_END }) : null
  const intents = week && step === 'done' ? describeIntents(weekIntentMinutes(week)) : null
  const coverage = plan && !manual && until !== null ? planCoverage(plan.entries, until) : null
  const gapSlot = plan && until !== null && coverage?.state === 'gaps' && onNavigate && FRONTYARD_ENABLED ? firstGapSlot(plan.entries, until) : null
  const gapAsk = plan && gapSlot ? frontyardPath(plan.schoolId, gapSlot, { write: true }) : null
  const starter = <PlanStarter answers={plan?.starter} step={step} suggested={suggested}
    busy={dayData === undefined && !withoutDayData && !hasDismissal} dayFailed={dayData === null}
    onContinueWithoutDay={() => setWithoutDayData(true)}
    hasSlots={hasSlots} courseFailed={courseFailed}
    onRetryCourses={() => { setCourseFailed(false); setCourseRetry((count) => count + 1) }}
    careDraft={returnAt === null ? null : afternoonCareFor(schoolId, careHours, returnAt)}
    evening={evening} eveningAdded={Boolean(evening && plan?.entries.some((e) => e.id === evening.id))} coverage={coverage}
    picker={picking && plan && step === 'courses' ? <MyAfterschoolPicker schoolId={schoolId} entries={plan.entries}
      starterData={courseData} onAdd={addEntry} onRemove={removeEntry}
      onDraft={() => { setSaveFailed(true); setMessage('요일·시간이 적혀 있지 않은 강좌는 완료 후 직접 넣어 주세요.') }} /> : null}
    onReturn={start} onDismissal={answerDismissal} onCare={answerCare} onCourses={answerCourses}
    onCoursesNext={() => { if (plan?.starter && setStarter({ ...plan.starter, courses: true })) setPicking(false) }}
    onEvening={() => { if (evening && !plan?.entries.some((entry) => entry.id === evening.id)) addEntry(evening) }}
    onDone={() => {
      if (!plan?.starter) return
      funnelMeasurement.timetableStep(schoolId, { step: 'fill', answer: 'yes' })
      setStarter({ ...plan.starter, done: true })
    }}
    onBack={() => {
      const answers = plan?.starter
      if (!answers || step === 'return' || step === 'done') return
      funnelMeasurement.timetableStep(schoolId, { step, answer: 'back' })
      if (step === 'courses' && picking) { setPicking(false); return }
      if (step === 'care' && context.needsDismissal && answers.dismissal) { setEditingDismissal(true); return }
      const saved = setStarter(step === 'dismissal' || step === 'care' ? { ...answers, returnAt: null }
        : step === 'courses' ? { ...answers, care: null } : { ...answers, courses: null })
      if (saved) setEditingDismissal(false)
    }} />

  return (
    <section className={`my-schedule my-card${plan ? ' my-schedule--editing' : ''}`} aria-labelledby="my-schedule-title">
      <div className="my-schedule__head">
        <h2 id="my-schedule-title">{manual ? '우리 아이 시간표' : plan ? `${shownName} 시간표` : `${shownName} 한 주 짜기`}</h2>

      </div>
      {pendingManual && plan && step === 'done' && <button type="button" className="my-button" onClick={() => {
        const current = readPlans()
        const latest = current.plans.find((item) => item.schoolId === schoolId)
        if (latest) persist(withManualEntries(current, { ...latest, updatedAt: new Date().toISOString() }), '직접 입력한 일정을 가져왔어요.')
      }}>직접 입력한 일정 가져오기</button>}
      {!plan && !manual ? <>
        <p className="my-help">질문 몇 개에 답하면 하교 시각부터 한 주가 채워져요. 이 기기에만 저장돼요.</p>
        {starter}
      </> : <>
        {step !== 'done' && starter}
        {plan?.starter?.done && <p className="my-help" data-testid="starter-complete">시간표 초안 완료 ✓</p>}
        {coverage && step === 'done' && <p className={`plan-coverage plan-coverage--${coverage.state}`} data-testid="plan-coverage">{describeCoverage(coverage)}</p>}
        {gapAsk && step === 'done' && <a className="my-button" data-testid="plan-gap-ask" href={gapAsk} onClick={(event) => followLink(event, gapAsk, onNavigate!)}>원하는 활동 알리기</a>}
        {step === 'done' && plan && !manual && <SchoolChecks entries={plan.entries} onInspect={(id, weekday) => setReviewEntry({ id, weekday })} />}
        {intents && <p className="plan-intents" data-testid="plan-intents">{intents}</p>}
        {step !== 'done' && plan && week ? <div className="my-week-section">
          <MyScheduleDay day={week[0]} entries={plan.entries} />
        </div> : <MyScheduleWeek key={`week-${schoolId}`} manualOnly={manual} reviewEntry={reviewEntry} pickupFocus={pickupFocus} schoolId={schoolId} onNavigate={manual ? undefined : onNavigate} entries={plan?.entries ?? []} onSave={saveCalendarEntry} onAdd={addEntry} onRemove={removeEntry}
          onToggleDay={(entry, weekday) => changeEntries((entries) => toggleProgramDay(entries, entry, weekday))}
          onSetTimes={(id, days, time, label) => changeEntriesIf((entries) => setEntryTimes(entries, id, days, time, label))}
          onRemoveDay={(id, weekday) => changeEntries((entries) => removeEntryDay(entries, id, weekday))}
          onStatus={(id, status) => changeEntries((entries) => entries.map((item) => item.id === id ? { ...item, participation: status } : item))}
          onIntent={(id, intent) => changeEntries((entries) => entries.map((item) => item.id === id ? { ...item, intent } : item))}
          onRepeat={(id, from, targets) => changeEntriesIf((entries) => repeatEntry(entries, id, from, targets))} />}
        {plan && step === 'done' && <><details className="my-entry-list"><summary>선택한 일정 관리 ({plan.entries.length})</summary>
          {plan.entries.map((e) => <div className="my-entry" key={e.id}>
            <b>{e.label}</b><small>{e.weekdays.map((d) => DAYS[d - 1]).join('·')} · {timing(e)}{e.dayTimes && ' · 요일마다 시간 다름'}</small>
            <small>{e.source ? `출처 ${SOURCES[e.kind]} · 학년도/확인 기준 ${e.source.version}` : '사용자 입력 · 운영 자료와 별도 확인 필요'}</small>
            {e.kind !== 'school' && <label className="my-field">참여 상태 · {e.label}
              <select value={e.participation} onChange={(event) => changeEntries((entries) => entries.map((item) => item.id === e.id ? { ...item, participation: event.target.value as ParticipationStatus } : item))}>
                {Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>}
            <button type="button" className="my-button" onClick={() => removeEntry(e.id)} aria-label={`${e.label} 일정 삭제`}>일정 삭제</button>
          </div>)}
        </details>
        <details className="my-schedule-notes"><summary>안내 · 초안 관리</summary>
          <p className="my-help">입학연도 {plan.entryYear ?? '미설정'} · 마지막 수정 {plan.updatedAt.slice(0, 10)}
            {entryYear !== plan.entryYear && ' · 현재 입학연도와 달라요. 자료를 다시 확인해 주세요.'}
            {!saved && ' · 관심 학교에 저장하지 않은 학교예요. 시간표는 이 기기에 따로 보관돼요.'}
          </p>
          <p className="my-help">위에서 학교를 바꾸면 해당 학교의 시간표를 볼 수 있어요. 학교 입학·프로그램 신청·참여 확정과는 별개예요.</p>
          <p className="my-help">돌봄 시간을 모르면 아침 08:00–09:00, 오후 17:00 종료를 기본으로 넣어요. 일정 카드를 눌러 실제 시간으로 바꿀 수 있어요. 운영·이용 가능 여부는 학교에 확인해 주세요.</p>
          {!manual && <button type="button" className="my-button" onClick={() => setStarter({ ...emptyStarter(), dismissal: plan.starter?.dismissal })}>질문 따라 다시 채우기</button>}
          <button type="button" className="my-button" onClick={() => {
            if (window.confirm('이 학교의 시간표 초안을 삭제할까요? 관심 학교는 유지됩니다.')) persist(deletePlan(readPlans(), plan.schoolId), '시간표 초안을 삭제했어요.', 'delete')
          }}>이 초안 삭제</button>
        </details></>}
      </>}
      {(step === 'done' || saveFailed) && <p role="status" aria-live="polite" className="my-help">{message}</p>}
    </section>
  )
}
