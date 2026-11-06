import { useEffect, useRef, useState } from 'react'
import { getSchoolDayEstimate } from '../../services/dataService'
import { formatMinutes, schoolEntriesFromEstimate } from '../../utils/schedule/fromSchoolData'
import { deletePlan, readPlans, subscribePlans, upsertPlan, writePlans, type PlanStore, type SchoolPlan } from '../../utils/schedule/plans'
import type { EntryKind, ParticipationStatus, ScheduleEntry } from '../../utils/schedule/types'
import { displaySchoolName } from '../../utils/schoolName'
import MyScheduleWeek from './MyScheduleWeek'
import { applyCalendarChange, type CalendarChange } from '../../utils/schedule/editing'
import { toggleProgramDay } from '../../utils/schedule/programSelection'
import { describeCoverage, firstGapSlot, planCoverage } from '../../utils/schedule/coverage'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { frontyardPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import { removeEntryDay, repeatEntry, setEntryTimes } from '../../utils/schedule/dayTimes'
import { afternoonCareFor, answerReturn, coverageUntil, emptyStarter, eveningCareFor, starterCareIds, starterStep, type ReturnAt, type StarterAnswers } from '../../utils/schedule/starter'
import type { SchoolCareHours } from '../../types'
import PlanStarter from './PlanStarter'
import MyAfterschoolPicker from './MyAfterschoolPicker'
import { describeIntents, weekIntentMinutes } from '../../utils/schedule/intent'
import { computeWeek } from '../../utils/schedule/engine'
import { CALENDAR_END } from '../../utils/schedule/calendar'

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
export default function MySchedule({ school, entryYear, saved, onNavigate }: {
  /** displayName은 화면 표기(광역시 접두 생략)용. 초안에는 공식 이름을 저장한다. */
  school: { id: string; name: string; displayName?: string }
  entryYear: number | null
  /** 관심 학교로 저장한 학교인지. 저장과 시간표는 별개라 안내만 달라진다. */
  saved: boolean
  /** 빈 시간에서 학교앞마당으로 넘어갈 때 쓴다. 없으면 그 버튼을 그리지 않는다. */
  onNavigate?: (path: string) => void
}) {
  const [store, setStore] = useState(readPlans)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  // 출발 계획이 쓰는 학교 돌봄 공시. 없거나 못 읽었으면 null — 17시 기본 가정으로 채운다.
  const [care, setCare] = useState<{ schoolId: string; hours: SchoolCareHours | null } | null>(null)
  const [picking, setPicking] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const unsubscribe = subscribePlans(() => setStore(readPlans()))
    return () => { alive.current = false; unsubscribe() }
  }, [])
  const schoolId = school.id
  const plan = store.plans.find((p) => p.schoolId === schoolId)
  const persist = (next: PlanStore, success: string) => {
    try { writePlans(next); setStore(next); setMessage(success); return true }
    catch { setMessage('저장하지 못했어요. 브라우저 저장 공간·설정을 확인해 주세요. 변경 내용은 저장되지 않았어요.'); return false }
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
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    if (!latest) { setMessage('초안이 변경됐어요. 학교를 다시 선택해 주세요.'); return null }
    const result = applyCalendarChange(latest.entries, change, crypto.randomUUID())
    if (!result.ok) { setMessage(result.reason === 'stale' ? '다른 탭에서 일정이 바뀌었어요. 다시 열어 주세요.' : '직접 입력한 일정의 이름·요일·시간을 확인해 주세요.'); return null }
    return updatePlan({ ...latest, entries: result.entries }) ? result.entry : null
  }
  // 2026-11-02 이전 초안(답이 없음)은 이미 채운 것으로 본다 — 질문으로 덮지 않는다.
  const step = plan && !plan.starter ? 'done' : starterStep(plan?.starter)
  // 질문 2·4단계에 돌봄 공시가 필요하다. 새로고침 뒤에도 이어서 묻도록 그때 다시 읽는다.
  useEffect(() => {
    if (!plan || (step !== 'care' && step !== 'fill') || care?.schoolId === schoolId) return
    let active = true
    getSchoolDayEstimate(schoolId, { allowDevFixture: false })
      .then((data) => { if (active) setCare({ schoolId, hours: data.care }) })
      .catch(() => { if (active) setCare({ schoolId, hours: null }) })
    return () => { active = false }
  }, [plan, step, schoolId, care?.schoolId])
  const careHours = care?.schoolId === schoolId ? care.hours : null
  const setStarter = (answers: StarterAnswers, change: (entries: ScheduleEntry[]) => ScheduleEntry[] = (entries) => entries) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    return latest ? updatePlan({ ...latest, starter: answers, entries: change(latest.entries) }) : false
  }
  // 1단계. 첫 답이 초안을 만든다 — 하교 시각을 먼저 넣고, 학교 자료를 못 읽어도 빈 초안이 아니라 질문으로 이어 간다.
  const start = async (returnAt: ReturnAt) => {
    if (loading) return
    // 다시 묻는 중이면 초안은 그대로, 답만 바꾼다. 하교 직후 귀가로 바꾸면 질문이 넣었던 돌봄은 뺀다.
    if (plan) { setStarter(answerReturn(returnAt), (entries) => returnAt === 'dismissal' ? entries.filter((e) => !starterCareIds(schoolId).includes(e.id)) : entries); return }
    setLoading(true); setMessage('')
    const chosen = { id: school.id, name: school.name }
    let data: Awaited<ReturnType<typeof getSchoolDayEstimate>> = { day: null, care: null }
    let failed = false
    try { data = await getSchoolDayEstimate(chosen.id, { allowDevFixture: false }) } catch { failed = true }
    if (!alive.current) return
    setLoading(false)
    setCare({ schoolId: chosen.id, hours: data.care })
    // No invented timetable, enrollment or development fixtures in persisted plans.
    const entries = data.day ? schoolEntriesFromEstimate(data.day).map((e) => ({ ...e,
      source: e.source ? { ...e.source, version: `${e.source.version} · 대상 ${data.day!.applies_to_entry_year}년 입학` } : undefined,
    })) : []
    const current = readPlans()
    if (current.plans.some((p) => p.schoolId === chosen.id)) { setMessage('이미 만들어진 초안을 유지했어요.'); return }
    persist(upsertPlan(current, { schoolId: chosen.id, schoolName: chosen.name, entryYear, entries, starter: answerReturn(returnAt), updatedAt: new Date().toISOString() }),
      failed ? '학교 자료를 불러오지 못해 하교 시각 없이 시작했어요. 하교 시각을 알면 정규수업 카드를 눌러 넣어 주세요.'
        : entries.length ? '예상 하교 시각을 넣었어요.' : '이 학교의 하교 시각 자료가 아직 없어요. 질문에 답하며 채워 보세요.')
  }
  const answerCare = (yes: boolean) => {
    const answers = plan?.starter
    if (!answers || typeof answers.returnAt !== 'number') return
    const ids = starterCareIds(schoolId)
    const entry = yes ? afternoonCareFor(schoolId, careHours, answers.returnAt) : null
    setStarter({ ...answers, care: yes }, (entries) => [...entries.filter((e) => !ids.includes(e.id)), ...(entry ? [entry] : [])])
  }
  const answerCourses = (yes: boolean) => {
    if (!plan?.starter) return
    if (yes) { setPicking(true); return }
    setStarter({ ...plan.starter, courses: false })
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
  const intents = plan ? describeIntents(weekIntentMinutes(computeWeek(plan.entries, { from: 'dismissal', to: CALENDAR_END }))) : null
  const coverage = plan && until !== null ? planCoverage(plan.entries, until) : null
  const gapSlot = plan && until !== null && coverage?.state === 'gaps' && onNavigate && FRONTYARD_ENABLED ? firstGapSlot(plan.entries, until) : null
  const gapAsk = plan && gapSlot ? frontyardPath(plan.schoolId, gapSlot, { write: true }) : null
  const starter = <PlanStarter answers={plan?.starter} suggested={suggested} busy={loading}
    careDraft={returnAt === null ? null : afternoonCareFor(schoolId, careHours, returnAt)}
    evening={evening} eveningAdded={Boolean(evening && plan?.entries.some((e) => e.id === evening.id))} coverage={coverage}
    picker={picking && plan && step === 'courses' ? <MyAfterschoolPicker schoolId={schoolId} entries={plan.entries} onAdd={addEntry} onRemove={removeEntry}
      onDraft={() => setMessage('요일·시간이 적혀 있지 않은 강좌는 다음 단계에서 시간표 빈칸을 눌러 직접 넣어 주세요.')} /> : null}
    onReturn={(value) => void start(value)} onCare={answerCare} onCourses={answerCourses}
    onCoursesNext={() => { setPicking(false); if (plan?.starter) setStarter({ ...plan.starter, courses: true }) }}
    onEvening={() => { if (evening) addEntry(evening) }}
    onDone={() => { if (plan?.starter) setStarter({ ...plan.starter, done: true }) }}
    onBack={() => {
      const answers = plan?.starter
      if (!answers) return
      if (step === 'courses' && picking) { setPicking(false); return }
      setStarter(step === 'care' ? { ...answers, returnAt: null } : step === 'courses' ? { ...answers, care: null } : { ...answers, courses: null })
    }} />

  return (
    <section className={`my-schedule my-card${plan ? ' my-schedule--editing' : ''}`} aria-labelledby="my-schedule-title">
      <div className="my-schedule__head">
        <h2 id="my-schedule-title">{plan ? `${shownName} 시간표` : `3. ${shownName} 시간표 짜기`}</h2>

      </div>
      {!plan ? <>
        <p className="my-help">질문 몇 개에 답하면 하교 시각부터 한 주가 채워져요. 이 기기에만 저장돼요.</p>
        {starter}
      </> : <>
        {step !== 'done' && starter}
        {coverage && step === 'done' && <p className={`plan-coverage plan-coverage--${coverage.state}`} data-testid="plan-coverage">{describeCoverage(coverage)}</p>}
        {gapAsk && step === 'done' && <a className="my-button" data-testid="plan-gap-ask" href={gapAsk} onClick={(event) => followLink(event, gapAsk, onNavigate!)}>원하는 활동 알리기</a>}
        {intents && <p className="plan-intents" data-testid="plan-intents">{intents}</p>}
        <MyScheduleWeek key={`week-${plan.schoolId}`} schoolId={plan.schoolId} onNavigate={onNavigate} entries={plan.entries} onSave={saveCalendarEntry} onAdd={addEntry} onRemove={removeEntry}
          onToggleDay={(entry, weekday) => changeEntries((entries) => toggleProgramDay(entries, entry, weekday))}
          onSetTimes={(id, days, time, label) => changeEntriesIf((entries) => setEntryTimes(entries, id, days, time, label))}
          onRemoveDay={(id, weekday) => changeEntries((entries) => removeEntryDay(entries, id, weekday))}
          onStatus={(id, status) => changeEntries((entries) => entries.map((item) => item.id === id ? { ...item, participation: status } : item))}
          onIntent={(id, intent) => changeEntries((entries) => entries.map((item) => item.id === id ? { ...item, intent } : item))}
          onRepeat={(id, from, targets) => changeEntriesIf((entries) => repeatEntry(entries, id, from, targets))} />
        <details className="my-entry-list"><summary>선택한 일정 관리 ({plan.entries.length})</summary>
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
          {step === 'done' && <button type="button" className="my-button" onClick={() => setStarter(emptyStarter())}>질문 따라 다시 채우기</button>}
          <button type="button" className="my-button" onClick={() => {
            if (window.confirm('이 학교의 시간표 초안을 삭제할까요? 관심 학교는 유지됩니다.')) persist(deletePlan(readPlans(), plan.schoolId), '시간표 초안을 삭제했어요.')
          }}>이 초안 삭제</button>
        </details>
      </>}
      <p role="status" aria-live="polite" className="my-help">{message}</p>
    </section>
  )
}
