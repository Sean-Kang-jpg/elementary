import { useEffect, useRef, useState } from 'react'
import { getSchoolDetail } from '../../services/dataService'
import { readFavorites, removeFavorite, saveFavorite, schoolFavorite, subscribeFavorites } from '../../utils/favorites'
import { displaySchoolName } from '../../utils/schoolName'
import SchoolSearch from './SchoolNameSearch'

/** Shared school list. Browsing a school and removing it are separate actions. */
export default function SchoolSelection({ schoolId, onChange, message: heldMessage, onMessage }: {
  schoolId: string | null
  onChange: (id: string | null) => void
  /** A parent that swaps layouts remounts this list; holding the message there keeps a refusal visible. */
  message?: string
  onMessage?: (message: string) => void
}) {
  const [favorites, setFavorites] = useState(readFavorites)
  const [ownMessage, setOwnMessage] = useState('')
  const message = heldMessage ?? ownMessage
  const setMessage = onMessage ?? setOwnMessage
  const [busy, setBusy] = useState(false)
  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])
  const schools = favorites.filter((item) => item.kind === 'school')
  const pick = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (!readFavorites().some((item) => item.kind === 'school' && item.id === id)) {
        const school = await getSchoolDetail(id)
        if (!school) throw new Error('학교를 찾지 못했어요. 다시 검색해 주세요.')
        saveFavorite(schoolFavorite(school))
      }
      onChange(id); setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : '학교를 추가하지 못했어요.') }
    finally { setBusy(false) }
  }
  const initialSchool = useRef(schoolId)
  const change = useRef(onChange)
  change.current = onChange
  const say = useRef(setMessage)
  say.current = setMessage
  useEffect(() => {
    const id = initialSchool.current
    if (!id || readFavorites().some((item) => item.kind === 'school' && item.id === id)) return
    let alive = true
    void getSchoolDetail(id).then((school) => {
      if (!alive) return
      try {
        if (!school) throw new Error('학교를 찾지 못했어요.')
        saveFavorite(schoolFavorite(school))
      } catch (error) {
        say.current(error instanceof Error ? error.message : '학교를 추가하지 못했어요.')
        change.current(readFavorites().find((item) => item.kind === 'school')?.id ?? null)
      }
    }).catch(() => { if (alive) { say.current('학교를 불러오지 못했어요. 다시 검색해 주세요.'); change.current(null) } })
    return () => { alive = false }
  }, [])
  return <div aria-label="내 학교 선택" aria-busy={busy}>
    <p className="my-help">내 학교 {schools.length}/3 · 시간표와 배움·돌봄에서 함께 사용해요.</p>
    <div className="timetable-picks">
      {schools.map((school) => <span key={school.id}>
        <button type="button" data-school-id={school.id} aria-pressed={school.id === schoolId} onClick={() => void pick(school.id)}>{displaySchoolName(school.name, school.address)}</button>
        <button type="button" aria-label={`${school.name} 학교 제거`} onClick={() => {
          try {
            if (removeFavorite(school) && school.id === schoolId) onChange(readFavorites().find((item) => item.kind === 'school')?.id ?? null)
          } catch { setMessage('학교를 제거하지 못했어요. 다시 시도해 주세요.') }
        }}>×</button>
      </span>)}
    </div>
    <SchoolSearch onPick={(id) => void pick(id)} />
    <p className="my-help" role="status">{busy ? '학교 확인 중…' : message}</p>
  </div>
}
