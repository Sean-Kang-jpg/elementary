import { useEffect, useRef, useState } from 'react'
import { getSchoolDayEstimate } from '../../services/dataService'
import { formatMinutes, schoolEntriesFromEstimate, toMinutes } from '../../utils/schedule/fromSchoolData'
import { WEEKDAYS } from '../../utils/schedule/engine'
import { deletePlan, readPlans, selectPlan, subscribePlans, upsertPlan, writePlans, type PlanStore, type SchoolPlan } from '../../utils/schedule/plans'
import type { EntryKind, ParticipationStatus, ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { displaySchoolName } from '../../utils/schoolName'
import MyAfterschoolPicker, { type EntryDraft } from './MyAfterschoolPicker'
import MyScheduleWeek from './MyScheduleWeek'
import { applyCalendarChange, type CalendarChange } from '../../utils/schedule/editing'
import { toggleProgramDay } from '../../utils/schedule/programSelection'

const DAYS = ['월', '화', '수', '목', '금']
const STATUS: Record<ParticipationStatus, string> = {
  considering: '후보', planned: '계획에 포함', applying: '신청 중',
  confirmed: '참여 확정', rejected: '미선정', cancelled: '취소',
}
const KINDS: Record<EntryKind, string> = { school: '정규수업', afterschool: '방과후', care: '돌봄', personal: '배움·활동 / 개인 일정' }
const SOURCES: Record<EntryKind, string> = { school: '학교별 예상 하교 자료', afterschool: '학교 방과후 운영계획', care: '학교 돌봄 운영 시간 자료', personal: '사용자 입력' }
const timing = (e: ScheduleEntry) => e.kind === 'school'
  ? `하교 ${e.end === null ? '미확인' : formatMinutes(e.end) + ' (예상)'}`
  : `${e.startsAfterSchool ? '하교 후' : e.start === null ? '시작 미확인' : formatMinutes(e.start)} ~ ${e.end === null ? '종료 미확인' : formatMinutes(e.end)}`

/**
 * 한 학교의 시간표 초안을 만들고 고친다. 학교는 시간표 미리 짜보기 화면(`/timetable`)이 고른다 —
 * 2026-10-19부터 관심 학교로 저장하지 않아도 짤 수 있고, MY에는 요약만 남았다.
 */
export default function MySchedule({ school, entryYear, saved }: {
  /** displayName은 화면 표기(광역시 접두 생략)용. 초안에는 공식 이름을 저장한다. */
  school: { id: string; name: string; displayName?: string }
  entryYear: number | null
  /** 관심 학교로 저장한 학교인지. 저장과 시간표는 별개라 안내만 달라진다. */
  saved: boolean
}) {
  const [store, setStore] = useState(readPlans)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<{ value: EntryDraft; schoolId: string; nonce: number } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const unsubscribe = subscribePlans(() => setStore(readPlans()))
    return () => { alive.current = false; unsubscribe() }
  }, [])
  const schoolId = school.id
  const plan = store.plans.find((p) => p.schoolId === schoolId)
  const active = store.plans.find((p) => p.schoolId === store.activeSchoolId)
  const persist = (next: PlanStore, success: string) => {
    try { writePlans(next); setStore(next); setMessage(success); return true }
    catch { setMessage('저장하지 못했어요. 브라우저 저장 공간·설정을 확인해 주세요. 변경 내용은 저장되지 않았어요.'); return false }
  }
  const updatePlan = (next: SchoolPlan) => persist(upsertPlan(readPlans(), { ...next, updatedAt: new Date().toISOString() }), '시간표 초안을 저장했어요.')
  const changeEntries = (change: (entries: ScheduleEntry[]) => ScheduleEntry[]) => {
    const latest = readPlans().plans.find((p) => p.schoolId === schoolId)
    return latest ? updatePlan({ ...latest, entries: change(latest.entries) }) : false
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
  const create = async (withoutData = false) => {
    if (loading) return
    setLoading(true); setMessage('')
    const chosen = { id: school.id, name: school.name }
    try {
      const data = withoutData ? { day: null, care: null } : await getSchoolDayEstimate(chosen.id, { allowDevFixture: false })
      if (!alive.current) return
      // No invented timetable, enrollment or development fixtures in persisted plans.
      const entries = [
        ...(data.day ? schoolEntriesFromEstimate(data.day).map((e) => ({ ...e,
          source: e.source ? { ...e.source, version: `${e.source.version} · 대상 ${data.day!.applies_to_entry_year}년 입학` } : undefined,
        })) : []),
      ]
      const current = readPlans()
      if (current.plans.some((p) => p.schoolId === chosen.id)) { setMessage('이미 만들어진 초안을 유지했어요.'); return }
      persist(upsertPlan(current, { schoolId: chosen.id, schoolName: chosen.name, entryYear, entries, updatedAt: new Date().toISOString() }),
        entries.length ? '예상 하교 시각을 가져왔어요. 과목·돌봄을 선택해 시간표를 채워 보세요.' : '초안을 만들었어요. 과목·돌봄을 선택하거나 일정을 직접 추가하세요.')
    } catch { if (alive.current) setMessage('학교 운영 자료를 불러오지 못했어요. 다시 시도하거나 자료 없이 초안을 만들 수 있어요.') }
    finally { if (alive.current) setLoading(false) }
  }
  return (
    <section className="my-schedule my-card" aria-labelledby="my-schedule-title">
      <h2 id="my-schedule-title">3. {school.displayName ?? displaySchoolName(school.name)} 시간표 짜기</h2>
      <p className="my-active-plan">{active ? `내 시간표 · ${displaySchoolName(active.schoolName)}` : '아직 내 시간표를 선택하지 않았어요'}</p>
      <p className="my-help">학교별 초안을 비교한 뒤 하나를 내 시간표로 사용하세요. 학교 입학·프로그램 신청·참여 확정과는 별개예요.</p>
      {!plan ? <div className="my-actions">
        <button type="button" className="my-button my-button--primary" disabled={loading} onClick={() => void create()}>{loading ? '자료 확인 중…' : '시간표 초안 만들기'}</button>
        <button type="button" className="my-button" disabled={loading} onClick={() => void create(true)}>자료 없이 직접 만들기</button>
      </div> : <>
        <div className="my-actions">
          <span className="my-plan-badge">{store.activeSchoolId === plan.schoolId ? '내 시간표' : '후보 초안'}</span>
          {store.activeSchoolId !== plan.schoolId
            ? <button type="button" className="my-button my-button--primary" onClick={() => persist(selectPlan(readPlans(), plan.schoolId), '내 시간표를 바꿨어요. 다른 초안은 그대로 보관돼요.')}>내 시간표로 사용</button>
            : <button type="button" className="my-button" onClick={() => persist(selectPlan(readPlans(), null), '내 시간표 선택을 해제했어요. 초안은 보관돼요.')}>선택 해제</button>}
        </div>
        <p className="my-help">입학연도 {plan.entryYear ?? '미설정'} · 마지막 수정 {plan.updatedAt.slice(0, 10)}
          {entryYear !== plan.entryYear && ' · 현재 입학연도와 달라요. 자료를 다시 확인해 주세요.'}
          {!saved && ' · 관심 학교에 저장하지 않은 학교예요. 시간표는 이 기기에 따로 보관돼요.'}
        </p>
        <MyScheduleWeek key={`week-${plan.schoolId}`} schoolId={plan.schoolId} entries={plan.entries} onSave={saveCalendarEntry} onAdd={addEntry} onRemove={removeEntry}
          onToggleDay={(entry, weekday) => changeEntries((entries) => toggleProgramDay(entries, entry, weekday))} />
        <details className="my-program-selection" key={`selection-${plan.schoolId}`}><summary>방과후/맞춤형/돌봄 선택하기</summary>
          <MyAfterschoolPicker key={plan.schoolId} schoolId={plan.schoolId} entries={plan.entries} onAdd={addEntry} onRemove={removeEntry}
            onDraft={(value) => { setDraft((current) => ({ value, schoolId: plan.schoolId, nonce: (current?.nonce ?? 0) + 1 })); setMessage('요일이 적혀 있지 않은 반이에요. 아래 양식에서 요일을 골라 저장해 주세요.') }} />
          <details className="my-entry-list"><summary>선택한 일정 관리 ({plan.entries.length})</summary>
            {plan.entries.map((e) => <div className="my-entry" key={e.id}>
              <b>{e.label}</b><small>{e.weekdays.map((d) => DAYS[d - 1]).join('·')} · {timing(e)}</small>
              <small>{e.source ? `출처 ${SOURCES[e.kind]} · 학년도/확인 기준 ${e.source.version}` : '사용자 입력 · 운영 자료와 별도 확인 필요'}</small>
              {e.kind !== 'school' && <label className="my-field">참여 상태 · {e.label}
                <select value={e.participation} onChange={(event) => changeEntries((entries) => entries.map((item) => item.id === e.id ? { ...item, participation: event.target.value as ParticipationStatus } : item))}>
                  {Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>}
              <button type="button" className="my-button" onClick={() => removeEntry(e.id)} aria-label={`${e.label} 일정 삭제`}>일정 삭제</button>
            </div>)}
          </details>
        </details>
        <ScheduleEntryForm key={`${plan.schoolId}-${draft?.nonce ?? 0}`} draft={draft?.schoolId === plan.schoolId ? draft.value : undefined} onAdd={addEntry} onComplete={() => setDraft(null)} />
        <p className="my-help">미확인 시간은 배치·공백 계산을 하지 않아요. 돌봄 운영 시간은 이용 가능이나 1학년 대상 확정을 뜻하지 않아요. 방학 일정은 별도 확인이 필요해요.</p>
        <button type="button" className="my-button" onClick={() => {
          if (window.confirm('이 학교의 시간표 초안을 삭제할까요? 관심 학교는 유지됩니다.')) persist(deletePlan(readPlans(), plan.schoolId), '시간표 초안을 삭제했어요.')
        }}>이 초안 삭제</button>
      </>}
      <p role="status" aria-live="polite" className="my-help">{message}</p>
    </section>
  )
}

function ScheduleEntryForm({ onAdd, draft, onComplete }: { onAdd: (entry: ScheduleEntry) => boolean; draft?: EntryDraft; onComplete: () => void }) {
  const [label, setLabel] = useState(draft?.label ?? '')
  const [kind, setKind] = useState<EntryKind>('afterschool')
  const [weekdays, setWeekdays] = useState<Weekday[]>(draft ? [] : [1])
  const [start, setStart] = useState(draft?.start ?? '')
  const [end, setEnd] = useState(draft?.end ?? '')
  const [error, setError] = useState('')
  const form = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (draft) {
      form.current?.scrollIntoView({ block: 'nearest' })
      form.current?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus({ preventScroll: true })
    }
  }, [draft])
  return <details className="my-entry-form" open={draft ? true : undefined} ref={form}><summary>추가 일정 입력하기{draft ? ` · ${draft.label}` : ''}</summary>
    <form onSubmit={(event) => {
      event.preventDefault()
      const from = toMinutes(start), to = toMinutes(end)
      if (!label.trim() || !weekdays.length || (from !== null && to !== null && from >= to)) {
        setError('일정 이름과 요일을 확인해 주세요. 종료 시간은 시작 시간 이후여야 해요.'); return
      }
      const saved = onAdd({ id: draft?.id ?? crypto.randomUUID(), label: label.trim(), kind, weekdays, start: from, end: to,
        evidence: from === null || to === null ? 'unknown' : 'estimated', participation: draft ? 'planned' : 'considering', transitionIn: 'unknown', term: 'semester',
        ...(draft?.source && label.trim() === draft.label ? { source: draft.source } : {}) })
      if (saved) { setLabel(''); setStart(''); setEnd(''); onComplete() }
      setError('')
    }}>
      <label className="my-field">일정 이름<input value={label} maxLength={80} required onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="my-field">유형<select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
        {Object.entries(KINDS).filter(([value]) => value !== 'school').map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
      <fieldset><legend>요일 (하나 이상)</legend><div className="my-actions">
        {WEEKDAYS.map((day) => <label key={day}><input type="checkbox" checked={weekdays.includes(day)} onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, day].sort() : weekdays.filter((d) => d !== day))} /> {DAYS[day - 1]}</label>)}
      </div></fieldset>
      <div className="my-time-fields">
        <label className="my-field">시작 (모르면 비워 두세요)<input type="time" step={draft ? undefined : 300} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="my-field">종료 (모르면 비워 두세요)<input type="time" step={draft ? undefined : 300} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <p className="my-help">{draft ? '고른 반은 ‘계획에 포함’으로 저장돼요. 요일은 학교 공지에서 확인해 주세요.' : '추가한 일정은 먼저 ‘후보’로 저장돼요. 일정 관리에서 계획 포함·신청·참여 상태를 따로 선택하세요.'}</p>
      <p role="alert" className="my-warning">{error}</p>
      <button type="submit" className="my-button">{draft ? '시간표에 넣기' : '후보 일정 저장'}</button>
      {draft && <button type="button" className="my-button" onClick={onComplete}>선택 취소</button>}
    </form>
  </details>
}
