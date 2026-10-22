import { useState, type FormEvent } from 'react'
import {
  CATEGORY_LABELS,
  createSeekPost,
  hasContactDetails,
  WEEKDAY_LABELS,
  type SeekDraft,
} from '../../services/frontyardService'
import type { FrontyardSlot } from '../../utils/urlState'
import { track } from '../../utils/analytics'

interface SeekComposerProps {
  schoolId: string
  schoolName: string | null
  initialSlot: FrontyardSlot | null
  onClose: () => void
  onPosted: () => void
}

const WEEKDAYS = [1, 2, 3, 4, 5]

/**
 * [찾아요] 쓰기. 고르기 위주로 두어 한 줄만 써도 올라가게 한다 — 입력 부담이 곧 수요 데이터의 양이다.
 * 아이 이름·집 주소·귀가 동선을 받는 칸은 없고, 연락처는 화면과 서버(SQL 33) 둘 다 막는다.
 */
export default function SeekComposer({ schoolId, schoolName, initialSlot, onClose, onPosted }: SeekComposerProps) {
  const [category, setCategory] = useState<SeekDraft['category']>('academy')
  const [grade, setGrade] = useState(1)
  const [days, setDays] = useState<number[]>(initialSlot ? [initialSlot.weekday] : [])
  const [start, setStart] = useState(initialSlot?.start ?? '14:00')
  const [end, setEnd] = useState(initialSlot?.end ?? '16:00')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [wantsVehicle, setWantsVehicle] = useState(false)
  const [wantsHomeVisit, setWantsHomeVisit] = useState(false)
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleDay = (day: number) => setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort())

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (title.trim().length < 2) { setError('제목을 두 글자 이상 써 주세요.'); return }
    if (!days.length) { setError('요일을 하나 이상 골라 주세요.'); return }
    if (!(start < end)) { setError('끝나는 시각이 시작보다 늦어야 해요.'); return }
    if ([title, body, budget].some(hasContactDetails)) { setError('전화번호·이메일·메신저 아이디는 쓸 수 없어요.'); return }
    setError(null)
    setSaving(true)
    const result = await createSeekPost({
      schoolId, category, title, body, grade, wantsVehicle, wantsHomeVisit, budget, days: 30,
      slots: days.map((weekday) => ({ weekday, start, end })),
    })
    setSaving(false)
    // 저장에 실패하면 올렸다고 말하지 않는다.
    if (!result.ok) { setError(result.message); return }
    track('frontyard_post', { post_type: 'seek', category })
    onPosted()
  }

  return (
    <form className="frontyard-composer my-card" onSubmit={submit} aria-labelledby="seek-title">
      <h2 id="seek-title">필요한 활동 남기기</h2>
      <p className="my-help">{schoolName ?? '이 학교'} 주변 부모에게 보여요. 같은 걸 찾는 부모가 ‘저도 필요해요’를 누르면 모여서 학원·기관에 전해요.</p>

      <fieldset>
        <legend>무엇을 찾나요</legend>
        <div className="frontyard-chips">
          {(Object.keys(CATEGORY_LABELS) as Array<SeekDraft['category']>).map((value) => (
            <button key={value} type="button" className="pref-chip" aria-pressed={category === value} onClick={() => setCategory(value)}>{CATEGORY_LABELS[value]}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>언제</legend>
        <div className="frontyard-chips">
          {WEEKDAYS.map((day) => (
            <button key={day} type="button" className="pref-chip" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>{WEEKDAY_LABELS[day]}</button>
          ))}
        </div>
        <div className="frontyard-time">
          <label>시작 <input type="time" value={start} step={600} onChange={(event) => setStart(event.target.value)} required /></label>
          <label>끝 <input type="time" value={end} step={600} onChange={(event) => setEnd(event.target.value)} required /></label>
          <label>학년
            <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>초{value}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <label className="my-field">제목
        <input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="예: 화·목 하교 후 돌봄 프로그램을 찾고 있어요" required />
      </label>
      <label className="my-field">더 적을 것 (선택)
        <textarea value={body} maxLength={1000} rows={3} onChange={(event) => setBody(event.target.value)} placeholder="원하는 수업 방식이나 조건" />
      </label>
      <div className="frontyard-checks">
        <label><input type="checkbox" checked={wantsVehicle} onChange={(event) => setWantsVehicle(event.target.checked)} /> 차량 희망</label>
        <label><input type="checkbox" checked={wantsHomeVisit} onChange={(event) => setWantsHomeVisit(event.target.checked)} /> 방문 희망</label>
        <label className="frontyard-budget">비용 <input value={budget} maxLength={40} onChange={(event) => setBudget(event.target.value)} placeholder="예: 월 20만 원 이하" /></label>
      </div>

      <p className="my-help">아이 이름, 집 주소, 귀가 길, 연락처는 쓰지 마세요. 글은 30일 뒤 자동으로 마감돼요. 로그인 없이 이 브라우저로 올라가요.</p>
      {error && <p className="frontyard-error" role="alert">{error}</p>}
      <div className="frontyard-composer__buttons">
        <button type="button" className="my-button" onClick={onClose}>닫기</button>
        <button type="submit" className="my-button my-button--primary" disabled={saving}>{saving ? '올리는 중…' : '올리기'}</button>
      </div>
    </form>
  )
}
