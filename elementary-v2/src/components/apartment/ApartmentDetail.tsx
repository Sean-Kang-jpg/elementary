import { ArrowLeft, Building2, CarFront, GraduationCap, Map, School, Star } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import type { Apartment, ApartmentAcademySummary } from '../../types'
import { getApartmentAcademySummaries } from '../../services/dataService'
import BottomSheet from '../ui/BottomSheet'
import ApartmentCard from './ApartmentCard'
import { apartmentFavorite, isFavorite as checkFavorite, toggleFavorite } from '../../utils/favorites'

interface ApartmentDetailProps {
  apartment: Apartment | null
  isOpen: boolean
  onClose: () => void
  onBack?: () => void
}

const parkingLabel = (ratio: number) => ratio >= 1 ? '여유' : ratio >= 0.7 ? '보통' : '부족'

const ApartmentDetail: React.FC<ApartmentDetailProps> = ({ apartment, isOpen, onClose, onBack }) => {
  const [isFavorite, setIsFavorite] = useState(false)
  const [sheetSnap, setSheetSnap] = useState(1)
  const [academySummary, setAcademySummary] = useState<ApartmentAcademySummary | undefined>()

  useEffect(() => {
    setIsFavorite(apartment ? checkFavorite('apartment', apartment.id) : false)
    setAcademySummary(undefined)
    if (!apartment?.id) return
    let active = true
    getApartmentAcademySummaries([apartment.id])
      .then((rows) => { if (active) setAcademySummary(rows[apartment.id]) })
      .catch((error) => console.error('학원 요약 조회 실패:', error))
    return () => { active = false }
  }, [apartment])

  if (!apartment) return null

  const totalAcademies = academySummary
    ? academySummary.core_institution_count + academySummary.extended_institution_count
    : null
  const parkingTotal = Math.max(apartment.parking_total || 0, 0)
  const undergroundShare = parkingTotal > 0 ? apartment.underground_parking / parkingTotal * 100 : 0

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={apartment.name}
      headerAction={(
        <button type="button" onClick={() => setIsFavorite(toggleFavorite(apartmentFavorite(apartment)))} aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={isFavorite} className={`rounded-md p-2 transition-colors hover:bg-gray-100 ${isFavorite ? 'text-amber-500' : 'text-gray-500'}`}>
          <Star size={21} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      )}
      snapPoints={[0.11, 0.45, 0.7, 0.88]}
      defaultSnap={1}
      swipeDownBehavior="minimize"
      onSnapChange={setSheetSnap}
    >
      {sheetSnap === 0 ? null : (
        <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-3">
          {onBack ? <button type="button" onClick={onBack} className="inline-flex items-center gap-1 py-1 text-sm font-medium text-blue-700 hover:text-blue-900"><ArrowLeft size={16} aria-hidden="true" />아파트 목록으로</button> : null}
          <p className="text-sm text-gray-600">{apartment.address}</p>
          <ApartmentCard apartment={apartment} academySummary={academySummary} />

          <section className="border-y border-gray-200 py-3" aria-labelledby="assigned-school-title">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-blue-50 text-blue-700"><School size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span id="assigned-school-title" className="block text-xs font-medium text-gray-500">배정 학교</span><strong className="mt-0.5 block truncate text-base text-gray-950">{apartment.assigned_school_name || '학교 정보 확인 중'}</strong></span>
            </div>
          </section>

          <section aria-labelledby="parking-title">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="parking-title" className="inline-flex items-center gap-2 font-semibold text-gray-950"><CarFront size={18} aria-hidden="true" />주차</h3>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${apartment.parking_per_household >= 1 ? 'bg-emerald-50 text-emerald-700' : apartment.parking_per_household >= 0.7 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>세대당 {apartment.parking_per_household.toFixed(1)}대 · {parkingLabel(apartment.parking_per_household)}</span>
            </div>
            <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-gray-200" aria-label={`지상 ${apartment.ground_parking}대, 지하 ${apartment.underground_parking}대`}><span className="bg-sky-400" style={{ width: `${100 - undergroundShare}%` }} /><span className="bg-teal-700" style={{ width: `${undergroundShare}%` }} /></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><span><b className="block text-sm text-gray-950">{parkingTotal.toLocaleString()}</b>전체</span><span><b className="block text-sm text-sky-700">{apartment.ground_parking.toLocaleString()}</b>지상</span><span><b className="block text-sm text-teal-800">{apartment.underground_parking.toLocaleString()}</b>지하</span></div>
            </div>
          </section>

          <section aria-labelledby="academy-title">
            <div className="mb-2 flex items-center justify-between"><h3 id="academy-title" className="inline-flex items-center gap-2 font-semibold text-gray-950"><GraduationCap size={18} aria-hidden="true" />주변 학원</h3>{totalAcademies != null ? <strong className="text-sm text-teal-800">{totalAcademies.toLocaleString()}곳</strong> : null}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-teal-50 p-3"><span className="text-xs text-teal-700">핵심 생활권 · 600m</span><strong className="mt-1 block text-xl text-teal-900">{academySummary?.core_institution_count.toLocaleString() ?? '-'}</strong></div>
              <div className="rounded-md bg-gray-100 p-3"><span className="text-xs text-gray-600">확장 생활권 · 800m</span><strong className="mt-1 block text-xl text-gray-900">{academySummary?.extended_institution_count.toLocaleString() ?? '-'}</strong></div>
            </div>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('joinmap:show-academies'))} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-teal-700 text-sm font-semibold text-teal-800 hover:bg-teal-50"><Map size={17} aria-hidden="true" />지도에서 학원 보기</button>
            <p className="mt-2 text-[11px] leading-4 text-gray-500">단지 기준 직선거리로 집계한 주변 학원·교습소이며 공식 배정 관계가 아닙니다.</p>
          </section>

          {apartment.public_rental_ratio > 0 ? <section className="flex items-center gap-3 border-t border-gray-200 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-orange-50 text-orange-700"><Building2 size={18} aria-hidden="true" /></span><span className="text-sm text-gray-700">공공임대 <b>{apartment.public_rental_units.toLocaleString()}세대</b> · 전체의 {apartment.public_rental_ratio}%</span></section> : null}
        </div>
      )}
    </BottomSheet>
  )
}

export default ApartmentDetail
