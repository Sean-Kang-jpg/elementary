import { useEffect, useState } from 'react'
import type { AcademyAddress } from '../../types'
import { getAcademiesNearSchool } from '../../services/dataService'
import NearbyProviderList from './NearbyProviderList'

/**
 * 학교 하나의 주변 기관 목록을 직접 불러와 보인다(배움·돌봄 탭). 학교 상세는 분야 분포와 같은 자료를 이미
 * 불러오므로 NearbyProviderList를 바로 쓴다. 불러오지 못하면 조용히 빠진다 — 이 탭의 주인공은 글 목록이다.
 */
export default function SchoolNearbyProviders({ schoolId, onNavigate }: { schoolId: string; onNavigate: (path: string) => void }) {
  const [loaded, setLoaded] = useState<{ id: string; academies: AcademyAddress[] } | null>(null)

  useEffect(() => {
    let active = true
    getAcademiesNearSchool(schoolId)
      .then((academies) => { if (active) setLoaded({ id: schoolId, academies }) })
      .catch(() => { if (active) setLoaded({ id: schoolId, academies: [] }) })
    return () => { active = false }
  }, [schoolId])

  if (loaded?.id !== schoolId) return <p className="my-help" role="status">주변 기관을 불러오는 중…</p>
  if (!loaded.academies.length) return null
  return <NearbyProviderList academies={loaded.academies} schoolId={schoolId} onNavigate={onNavigate} />
}
