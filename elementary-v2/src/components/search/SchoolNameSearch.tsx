import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { School } from '../../types'
import { searchSchoolsByName } from '../../services/dataService'
import { displaySchoolName } from '../../utils/schoolName'

/** 학교 이름으로 찾아 하나를 고른다. 시간표 미리 짜보기와 학교앞마당이 같이 쓴다. */
export default function SchoolSearch({ onPick }: { onPick: (schoolId: string) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<School[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  useEffect(() => {
    const query = term.trim()
    let active = true
    if (query.length < 2) { setResults([]); setState('idle'); return }
    setResults([])
    setState('loading')
    const timer = window.setTimeout(() => {
      searchSchoolsByName(query)
        .then((rows) => { if (active) { setResults(rows); setState('idle') } })
        .catch(() => { if (active) { setResults([]); setState('error') } })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [term])
  const query = term.trim()

  return (
    <div className="timetable-search">
      <label className="timetable-search__field">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">초등학교 이름</span>
        <input type="search" value={term} placeholder="초등학교 이름 (예: 대현초)" autoComplete="off"
          onChange={(event) => setTerm(event.target.value)} />
      </label>
      {query.length >= 2 && (
        <ul className="timetable-search__results" aria-live="polite">
          {state === 'loading' && !results.length && <li className="my-help">찾는 중…</li>}
          {state === 'error' && <li className="my-help">검색하지 못했어요. 잠시 뒤 다시 시도해 주세요.</li>}
          {state === 'idle' && !results.length && <li className="my-help">‘{query}’ 학교를 찾지 못했어요.</li>}
          {results.map((item) => (
            <li key={item.school_id}>
              <button type="button" onClick={() => { onPick(item.school_id); setTerm('') }}>
                <strong>{displaySchoolName(item.school_name, item.address)}</strong>
                <small>{item.address}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
