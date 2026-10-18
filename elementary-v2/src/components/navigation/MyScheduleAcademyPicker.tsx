import { useEffect, useState } from 'react'
import { getAcademiesNearSchool } from '../../services/dataService'
import type { AcademyAddress } from '../../types'
import { ACADEMY_CATEGORIES, getInstitutionCategories, type AcademyCategoryKey } from '../../utils/academyCategories'

export default function MyScheduleAcademyPicker({ schoolId, onChoose }: { schoolId: string; onChoose: (label: string) => void }) {
  const [category, setCategory] = useState<AcademyCategoryKey | null>(null)
  const [data, setData] = useState<AcademyAddress[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const enabled = category !== null
  useEffect(() => {
    if (!enabled) return
    let active = true
    setData(null); setError(false)
    void getAcademiesNearSchool(schoolId).then((rows) => { if (active) setData(rows) })
      .catch(() => { if (active) { setError(true); setData(null) } })
    return () => { active = false }
  // Fetch once per school/retry; changing a topic filters the same published dataset.
  }, [schoolId, retry, enabled])
  const rows = (data ?? []).flatMap((address) => address.institutions
    .filter((institution) => institution.name && getInstitutionCategories(institution).some((item) => item.key === category)
      && institution.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .map((institution) => ({ ...institution, addressId: address.address_id, distance: address.straight_distance_m })))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'ko'))
  return <section className="my-academy-picker" aria-label="주변 학원 선택">
    <p className="my-help">선택한 학교 기준 직선거리 800m 이내예요. 먼저 분야를 선택하세요.</p>
    <div className="my-academy-topics" role="group" aria-label="학원 분야">
      {ACADEMY_CATEGORIES.map((item) => <button type="button" key={item.key} aria-pressed={category === item.key}
        onClick={() => { setCategory(item.key); onChoose('') }}>{item.key === 'arts' ? '미술·음악·무용' : item.label}</button>)}
    </div>
    {category && <>
      <label className="my-field">학원 이름으로 좁히기<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학원 이름" /></label>
      {error ? <div role="alert"><p className="my-help">주변 학원 자료를 불러오지 못했어요.</p><button className="my-button" type="button" onClick={() => setRetry((n) => n + 1)}>학원 다시 불러오기</button></div>
        : data === null ? <p role="status" className="my-help">근처 학원을 찾고 있어요…</p>
          : <ul className="my-academy-results" aria-label="선택 분야 근처 학원 목록">
            {rows.map((item, index) => <li key={`${item.addressId}-${item.name}-${index}`}><button type="button" onClick={() => onChoose(`${ACADEMY_CATEGORIES.find((item) => item.key === category)!.label} · ${item.name}`.slice(0, 80))}>
              <b>{item.name}</b><span>{item.type} · 직선거리 {Math.round(item.distance).toLocaleString()}m</span>
            </button></li>)}
            {!rows.length && <li className="my-help">조건에 맞는 학원이 조회되지 않았어요. 분야·검색어를 바꾸거나 직접 입력할 수 있어요.</li>}
          </ul>}
      <p className="my-help">분야는 상호명 기반 분류예요. 실제 수업·대상학년·운영요일·시간·이동 가능 여부는 학원에 확인해 주세요.</p>
    </>}
  </section>
}
