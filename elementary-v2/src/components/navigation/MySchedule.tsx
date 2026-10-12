import { useEffect, useRef, useState } from 'react'
import type { FavoriteRecord } from '../../utils/favorites'
import { getSchoolDayEstimate } from '../../services/dataService'
import { careEntriesFromHours, formatMinutes, schoolEntriesFromEstimate, toMinutes } from '../../utils/schedule/fromSchoolData'
import { computeWeek, WEEKDAYS } from '../../utils/schedule/engine'
import { deletePlan, readPlans, selectPlan, subscribePlans, upsertPlan, writePlans, type PlanStore, type SchoolPlan } from '../../utils/schedule/plans'
import type { EntryKind, ParticipationStatus, ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { displaySchoolName } from '../../utils/schoolName'

const DAYS = ['월', '화', '수', '목', '금']
const STATUS: Record<ParticipationStatus, string> = {
  considering: '후보', planned: '계획에 포함', applying: '신청 중',
  confirmed: '참여 확정', rejected: '미선정', cancelled: '취소',
}
const KINDS: Record<EntryKind, string> = { school: '정규수업', afterschool: '방과후', care: '돌봄', personal: '배움·활동 / 개인 일정' }
const timing = (e: ScheduleEntry) => e.kind === 'school'
  ? `하교 ${e.end === null ? '미확인' : formatMinutes(e.end) + ' (예상)'}`
  : `${e.startsAfterSchool ? '하교 후' : e.start === null ? '시작 미확인' : formatMinutes(e.start)} ~ ${e.end === null ? '종료 미확인' : formatMinutes(e.end)}`

export default function MySchedule({ schools, entryYear }: { schools: FavoriteRecord[]; entryYear: number | null }) {
  const [store, setStore] = useState(readPlans)
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const unsubscribe = subscribePlans(() => setStore(readPlans()))
    return () => { alive.current = false; unsubscribe() }
  }, [])
  const options = [...schools.map((s) => ({ id: s.id, name: s.name })),
    ...store.plans.filter((p) => !schools.some((s) => s.id === p.schoolId)).map((p) => ({ id: p.schoolId, name: p.schoolName }))]
  const schoolId = options.some((s) => s.id === selectedId) ? selectedId : store.activeSchoolId || options[0]?.id || ''
  const plan = store.plans.find((p) => p.schoolId === schoolId)
  const active = store.plans.find((p) => p.schoolId === store.activeSchoolId)
  const school = options.find((s) => s.id === schoolId)
  const persist = (next: PlanStore, success: string) => {
    try { writePlans(next); setStore(next); setMessage(success); return true }
    catch { setMessage('저장하지 못했어요. 브라우저 저장 공간·설정을 확인해 주세요. 변경 내용은 저장되지 않았어요.'); return false }
  }
  const updatePlan = (next: SchoolPlan) => persist(upsertPlan(readPlans(), { ...next, updatedAt: new Date().toISOString() }), '시간표 초안을 저장했어요.')
  const create = async (withoutData = false) => {
    if (!school || loading) return
    setLoading(true); setMessage('')
    const chosen = { ...school }
    try {
      const data = withoutData ? { day: null, care: null } : await getSchoolDayEstimate(chosen.id, { allowDevFixture: false })
      if (!alive.current) return
      // No invented timetable, enrollment or development fixtures in persisted plans.
      const entries = [
        ...(data.day ? schoolEntriesFromEstimate(data.day).map((e) => ({ ...e,
          source: e.source ? { ...e.source, version: `${e.source.version} · 대상 ${data.day!.applies_to_entry_year}년 입학` } : undefined,
        })) : []),
        ...(data.care ? careEntriesFromHours(data.care).map((e) => ({ ...e, transitionIn: 'unknown' as const })) : []),
      ]
      const current = readPlans()
      if (current.plans.some((p) => p.schoolId === chosen.id)) { setMessage('이미 만들어진 초안을 유지했어요.'); return }
      persist(upsertPlan(current, { schoolId: chosen.id, schoolName: chosen.name, entryYear, entries, updatedAt: new Date().toISOString() }),
        entries.length ? '자료를 후보로 가져왔어요. 학년도·대상·신청 조건과 이동 가능 여부를 학교에 확인해 주세요.' : '확인된 운영 시간 자료가 없어요. 직접 일정을 추가할 수 있어요.')
    } catch { if (alive.current) setMessage('학교 운영 자료를 불러오지 못했어요. 다시 시도하거나 자료 없이 초안을 만들 수 있어요.') }
    finally { if (alive.current) setLoading(false) }
  }
  const days = plan ? computeWeek(plan.entries, { from: 'dismissal', to: 18 * 60 }) : []
  return (
    <section className="my-schedule my-card" aria-labelledby="my-schedule-title">
      <h2 id="my-schedule-title">우리 아이 시간표</h2>
      <p className="my-active-plan">{active ? `내 시간표 · ${displaySchoolName(active.schoolName)}` : '아직 내 시간표를 선택하지 않았어요'}</p>
      <p className="my-help">학교별 초안을 비교한 뒤 하나를 내 시간표로 사용하세요. 학교 입학·프로그램 신청·참여 확정과는 별개예요.</p>
      {options.length ? <>
        <label className="my-field">살펴볼 학교 초안
          <select value={schoolId} disabled={loading} onChange={(e) => { setSelectedId(e.target.value); setMessage('') }}>
            {options.map((s) => <option key={s.id} value={s.id}>{displaySchoolName(s.name)}{store.activeSchoolId === s.id ? ' · 내 시간표' : ''}</option>)}
          </select>
        </label>
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
            {!schools.some((s) => s.id === plan.schoolId) && ' · 관심 학교에서 삭제한 초안이에요. 시간표는 유지돼요.'}
          </p>
          <div className="my-week" aria-label="요일별 시간표">
            {days.map((day) => <div className="my-week__day" key={day.weekday}>
              <h3>{DAYS[day.weekday - 1]}</h3>
              {plan.entries.filter((e) => e.weekdays.includes(day.weekday) && !['cancelled', 'rejected'].includes(e.participation)).map((e) => (
                <p key={e.id} className={e.participation === 'considering' ? 'my-week__candidate' : ''}>
                  <b>{e.label}</b><small>{timing(e)}<br />{e.kind === 'school' ? '자료 기반 예상' : STATUS[e.participation]}</small>
                </p>
              ))}
              {!plan.entries.some((e) => e.weekdays.includes(day.weekday)) && <p>일정 없음<br /><small>자료 미확인</small></p>}
              {day.overlaps.length > 0 && <small className="my-warning">시간 겹침 {day.overlaps.length}건 · 이동·돌봄 중 수업 참여 확인</small>}
            </div>)}
          </div>
          <details className="my-entry-list"><summary>일정·참여 상태 관리 ({plan.entries.length})</summary>
            {plan.entries.map((e) => <div className="my-entry" key={e.id}>
              <b>{e.label}</b><small>{e.weekdays.map((d) => DAYS[d - 1]).join('·')} · {timing(e)}</small>
              <small>{e.source ? `출처 ${e.kind === 'school' ? '학교별 예상 하교 자료' : '학교 돌봄 운영 시간 자료'} · 학년도/확인 기준 ${e.source.version}` : '사용자 입력 · 운영 자료와 별도 확인 필요'}</small>
              {e.kind !== 'school' && <label className="my-field">참여 상태 · {e.label}
                <select value={e.participation} onChange={(event) => updatePlan({ ...plan, entries: plan.entries.map((item) => item.id === e.id ? { ...item, participation: event.target.value as ParticipationStatus } : item) })}>
                  {Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>}
              <button type="button" className="my-button" onClick={() => updatePlan({ ...plan, entries: plan.entries.filter((item) => item.id !== e.id) })} aria-label={`${e.label} 일정 삭제`}>일정 삭제</button>
            </div>)}
          </details>
          <ScheduleEntryForm key={plan.schoolId} onAdd={(entry) => updatePlan({ ...plan, entries: [...plan.entries, entry] })} />
          <p className="my-help">미확인 시간은 배치·공백 계산을 하지 않아요. 돌봄 운영 시간은 이용 가능이나 1학년 대상 확정을 뜻하지 않아요. 방학 일정은 별도 확인이 필요해요.</p>
          <button type="button" className="my-button" onClick={() => {
            if (window.confirm('이 학교의 시간표 초안을 삭제할까요? 관심 학교는 유지됩니다.')) persist(deletePlan(readPlans(), plan.schoolId), '시간표 초안을 삭제했어요.')
          }}>이 초안 삭제</button>
        </>}
      </> : <p className="my-help">아래 관심 학교를 저장하면 학교별 시간표를 만들 수 있어요. 아파트 저장만으로 학교를 자동 선택하지 않아요.</p>}
      <p role="status" aria-live="polite" className="my-help">{message}</p>
    </section>
  )
}

function ScheduleEntryForm({ onAdd }: { onAdd: (entry: ScheduleEntry) => boolean }) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<EntryKind>('afterschool')
  const [weekdays, setWeekdays] = useState<Weekday[]>([1])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  return <details className="my-entry-form"><summary>방과후·돌봄·배움활동 일정 추가</summary>
    <form onSubmit={(event) => {
      event.preventDefault()
      const from = toMinutes(start), to = toMinutes(end)
      if (!label.trim() || !weekdays.length || (from !== null && to !== null && from >= to)) {
        setError('일정 이름과 요일을 확인해 주세요. 종료 시간은 시작 시간 이후여야 해요.'); return
      }
      const saved = onAdd({ id: crypto.randomUUID(), label: label.trim(), kind, weekdays, start: from, end: to,
        evidence: from === null || to === null ? 'unknown' : 'estimated', participation: 'considering', transitionIn: 'unknown', term: 'semester' })
      if (saved) { setLabel(''); setStart(''); setEnd('') }
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
        <label className="my-field">시작 (모르면 비워 두세요)<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="my-field">종료 (모르면 비워 두세요)<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <p className="my-help">추가한 일정은 먼저 ‘후보’로 저장돼요. 일정 관리에서 계획 포함·신청·참여 상태를 따로 선택하세요.</p>
      <p role="alert" className="my-warning">{error}</p>
      <button type="submit" className="my-button">후보 일정 저장</button>
    </form>
  </details>
}
