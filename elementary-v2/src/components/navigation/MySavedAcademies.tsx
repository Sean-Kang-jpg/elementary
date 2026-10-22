import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { readSavedAcademies, removeSavedAcademy, subscribeSavedAcademies } from '../../utils/savedAcademies'
import { VIEW_PATHS } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'

/**
 * MY의 관심 학원 (인수인계서 4.1 Case C). 수업 시간을 몰라 시간표에 못 넣은 학원을 기억해 둔다.
 * 지도 학원 상세의 '관심 학원 저장'으로 담기고, 이 기기에만 있다. 한 곳도 없으면 칸을 그리지 않는다.
 */
export default function MySavedAcademies({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [items, setItems] = useState(readSavedAcademies)
  const [error, setError] = useState(false)
  useEffect(() => subscribeSavedAcademies(() => setItems(readSavedAcademies())), [])
  if (!items.length) return null
  return (
    <section className="my-card my-saved-academies" aria-labelledby="my-saved-academies-title">
      <h2 id="my-saved-academies-title">관심 학원 <small>{items.length}곳</small></h2>
      <p className="my-help">수업 시간을 알게 되면 지도에서 그 학원의 ‘내 시간표에 추가’로 담아 주세요.</p>
      <ul>
        {items.map((item) => (
          <li key={item.providerKey ?? `${item.addressId}-${item.name}`}>
            <span className="min-w-0 flex-1"><strong>{item.name}</strong><small>{item.category} · {item.area}</small></span>
            <button type="button" className="my-button" aria-label={`${item.name} 관심 학원에서 빼기`}
              onClick={() => { try { removeSavedAcademy(item); setError(false) } catch { setError(true) } }}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="my-help" role="alert">이 브라우저에서 지우지 못했어요.</p>}
      <a className="my-saved-academies__map" href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>지도에서 학원 더 보기</a>
    </section>
  )
}
