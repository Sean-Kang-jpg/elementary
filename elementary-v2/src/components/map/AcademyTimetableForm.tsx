import { useState, type FormEvent } from 'react'
import { readPlans, writePlans } from '../../utils/schedule/plans'
import { addAcademyToPlan } from '../../utils/schedule/frontyard'
import { displaySchoolName } from '../../utils/schoolName'
import { timetablePath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import { track } from '../../utils/analytics'

const DAYS = ['월', '화', '수', '목', '금']
const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

interface AcademyTimetableFormProps {
  label: string
  providerKey?: string
  onNavigate: (path: string) => void
  onDone: (message: string) => void
}

/**
 * 지도 학원 상세에서 그 학원을 내 시간표에 넣는다(인수인계서 4.1 Case B). 학원의 수업 시간은 우리가 모르므로
 * 부모가 아는 요일·시간을 직접 넣는다. 학원 신청이 아니고, 학원 공식 정보로도 쓰지 않는다.
 */
export default function AcademyTimetableForm({ label, providerKey, onNavigate, onDone }: AcademyTimetableFormProps) {
  const [store] = useState(readPlans)
  const [schoolId, setSchoolId] = useState(store.activeSchoolId ?? store.plans[0]?.schoolId ?? '')
  const [days, setDays] = useState<number[]>([])
  const [start, setStart] = useState('15:00')
  const [end, setEnd] = useState('16:00')
  const [attending, setAttending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!store.plans.length) {
    return (
      <p className="map-academy-form__empty">
        먼저 우리 아이 학교의 시간표 초안을 만들어 주세요.{' '}
        <a href={timetablePath()} onClick={(event) => followLink(event, timetablePath(), onNavigate)}>시간표 만들기</a>
      </p>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const latest = readPlans()
    const plan = latest.plans.find((item) => item.schoolId === schoolId)
    if (!plan) { setError('시간표를 다시 골라 주세요.'); return }
    const result = addAcademyToPlan(plan, { label, providerKey, weekdays: days, start: toMinutes(start), end: toMinutes(end), attending }, () => crypto.randomUUID())
    if (!result.ok) { setError(days.length ? '끝나는 시각이 시작보다 늦어야 해요.' : '요일을 하나 이상 골라 주세요.'); return }
    try {
      writePlans({ ...latest, plans: latest.plans.map((item) => (item.schoolId === schoolId ? result.plan : item)) })
    } catch {
      // 기기 저장이 막히면 담았다고 말하지 않는다.
      setError('이 브라우저에 저장하지 못했어요.')
      return
    }
    track('map_academy_add_timetable', { status: attending ? 'attending' : 'planned' })
    onDone(`${displaySchoolName(plan.schoolName)} 시간표에 담았어요. 요일마다 시간이 다르면 한 번 더 담아 주세요.`)
  }

  return (
    <form className="map-academy-form" onSubmit={submit} aria-label={`${label} 시간표에 추가`}>
      {store.plans.length > 1 && (
        <label>시간표
          <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
            {store.plans.map((item) => <option key={item.schoolId} value={item.schoolId}>{displaySchoolName(item.schoolName)}</option>)}
          </select>
        </label>
      )}
      <div className="map-academy-form__days" role="group" aria-label="요일">
        {DAYS.map((day, index) => (
          <button key={day} type="button" aria-pressed={days.includes(index + 1)}
            onClick={() => setDays((prev) => (prev.includes(index + 1) ? prev.filter((d) => d !== index + 1) : [...prev, index + 1]))}>{day}</button>
        ))}
      </div>
      <div className="map-academy-form__times">
        <label>시작 <input type="time" value={start} step={300} onChange={(event) => setStart(event.target.value)} required /></label>
        <label>끝 <input type="time" value={end} step={300} onChange={(event) => setEnd(event.target.value)} required /></label>
      </div>
      <div className="map-academy-form__status" role="radiogroup" aria-label="이용 상태">
        <label><input type="radio" name="status" checked={!attending} onChange={() => setAttending(false)} /> 예정·검토 중</label>
        <label><input type="radio" name="status" checked={attending} onChange={() => setAttending(true)} /> 지금 다니는 중</label>
      </div>
      <p className="map-academy-form__note">등록된 수업 시간 정보가 없어요. 알고 계신 시간을 직접 입력해 주세요.</p>
      {error && <p className="map-academy-form__error" role="alert">{error}</p>}
      <button type="submit" className="map-academy-form__submit">시간표에 담기</button>
    </form>
  )
}
