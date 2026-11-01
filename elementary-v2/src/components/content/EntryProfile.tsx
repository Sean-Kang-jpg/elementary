import { useState } from 'react'
import { birthYearOf, STAGE_LABELS, stageOf } from '../../utils/entryYear'
import type { Profile } from '../../utils/profile'
import EntryYearPicker from './EntryYearPicker'

interface EntryProfileProps {
  entryYear: number | null
  profile: Profile
  onEntryYearChange: (year: number) => void
  /** 고르기 전 칩 위의 질문. */
  label?: string
}

/**
 * 입학연도 한 줄(단계·출생연도·관심 학교·이사)과 바꾸기. 연도가 없으면 칩 세 개.
 * MY와 우리집 일정의 입학까지 면이 같이 쓴다(UX-26) — 같은 저장값이라 한쪽에서 바꾸면 다른 쪽도 바뀐다.
 */
export default function EntryProfile({ entryYear, profile, onEntryYearChange, label }: EntryProfileProps) {
  const stage = entryYear ? stageOf(entryYear) : null
  const [editing, setEditing] = useState(false)
  const interestLabel = profile.interest.includes('private') ? '사립·국립 관심' : '공립'
  const movingLabel = profile.moving === 'planned' ? '이사 예정' : profile.moving === 'considering' ? '이사 검토 중' : null

  return (
    <section className="my-preparation" aria-label="입학연도">
      {entryYear && stage && !editing ? (
        <div className="hub-profile">
          <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
          <p>
            <b>{entryYear}년 입학</b> · {birthYearOf(entryYear)}년생 · {interestLabel}{movingLabel ? ` · ${movingLabel}` : ''}
          </p>
          <button type="button" onClick={() => setEditing(true)} className="hub-profile__edit">바꾸기</button>
        </div>
      ) : (
        <div className="home-card">
          <EntryYearPicker value={entryYear} label={label} onChange={(year) => { onEntryYearChange(year); setEditing(false) }} />
        </div>
      )}
    </section>
  )
}
