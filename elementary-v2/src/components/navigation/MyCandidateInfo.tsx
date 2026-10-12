import { useEffect, useState } from 'react'
import type { FavoriteRecord } from '../../utils/favorites'
import { saveFavorite, schoolFavorite } from '../../utils/favorites'
import { getAcademiesNearApartment, getAcademiesNearSchool, getSchoolDetail } from '../../services/dataService'
import type { AcademyAddress, School } from '../../types'
import SchoolCarePanel from '../care/SchoolCarePanel'
import { displaySchoolName } from '../../utils/schoolName'

/** Mounted only when expanded; no background requests for all saved candidates. */
export default function MyCandidateInfo({ item, onNavigate, onOpenSaved }: {
  item: FavoriteRecord; onNavigate: (path: string) => void; onOpenSaved: (item: FavoriteRecord) => void
}) {
  const [school, setSchool] = useState<School | null>(null)
  const [academies, setAcademies] = useState<AcademyAddress[] | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const schoolId = item.kind === 'school' ? item.id : item.schoolId
  const kind = item.kind, id = item.id
  useEffect(() => {
    let alive = true
    setLoading(true); setSchool(null); setAcademies(null); setMessage('')
    void Promise.allSettled([
      schoolId ? getSchoolDetail(schoolId) : Promise.resolve(null),
      kind === 'school' ? getAcademiesNearSchool(id) : getAcademiesNearApartment(id),
    ]).then(([schoolResult, academyResult]) => {
      if (!alive) return
      if (schoolResult.status === 'fulfilled') setSchool(schoolResult.value)
      if (academyResult.status === 'fulfilled') setAcademies(academyResult.value)
      if (schoolResult.status === 'rejected' || academyResult.status === 'rejected') setMessage('일부 정보를 불러오지 못했어요. 상세 화면에서 다시 확인해 주세요.')
      setLoading(false)
    })
    return () => { alive = false }
  }, [kind, id, schoolId])
  const saveAssignedSchool = async () => {
    if (!school || saving) return
    setSaving(true)
    try { saveFavorite(schoolFavorite(school)); setMessage('배정 학교를 관심 학교에 저장했어요. 시간표는 위에서 별도로 만들고 선택하세요.') }
    catch (error) { setMessage(error instanceof Error ? error.message : '학교를 저장하지 못했어요.') }
    finally { setSaving(false) }
  }
  return <div className="my-candidate-info">
    {loading ? <p role="status">운영 정보와 주변 교육환경을 확인 중이에요.</p> : <>
      {item.kind === 'apartment' && <div>
        <h3>배정 학교</h3>
        <p>{school ? displaySchoolName(school.school_name, school.address) : item.schoolName ? displaySchoolName(item.schoolName, item.address) : '배정 학교 미확인'}</p>
        <p className="my-help">저장된 배정 정보예요. 공동학구·조건별 배정과 최신 학구는 상세에서 확인하세요.</p>
        {school && <div className="my-actions">
          <button type="button" className="my-button" disabled={saving} onClick={() => void saveAssignedSchool()}>관심 학교로 저장</button>
          <button type="button" className="my-button" onClick={() => onOpenSaved(schoolFavorite(school))}>학교 상세 보기</button>
        </div>}
      </div>}
      {item.kind === 'school' && school && <SchoolCarePanel school={school} onOpenGuide={onNavigate} />}
      <h3>주변 교육환경</h3>
      <p>{academies === null ? '조회 상태 미확인' : academies.length
        ? `현재 조회된 학원·교습소·체육도장 ${academies.reduce((sum, row) => sum + row.institution_count, 0)}곳`
        : '조회된 시설 없음 · 실제 시설 부재를 뜻하지 않아요'}</p>
      <p className="my-help">교육환경 자료의 대상·거리·출처와 확인일은 상세에서 확인하세요. 운영 시간·초등 수강·모집 여부는 별도 확인이 필요해요.</p>
      <button type="button" className="my-button" onClick={() => onOpenSaved(item)}>방과후·돌봄·배움활동 상세 보기</button>
    </>}
    <p role="status" className="my-help">{message}</p>
  </div>
}
