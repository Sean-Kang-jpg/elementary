import { Building2, CarFront, ChevronRight, GraduationCap } from 'lucide-react'
import type { Apartment, ApartmentAcademySummary } from '../../types'

interface ApartmentCardProps {
  apartment: Apartment
  academySummary?: ApartmentAcademySummary
  compact?: boolean
  onClick?: () => void
}

const ageTone = (age: number) => {
  if (age <= 10) return { label: '신축', className: 'bg-emerald-50 text-emerald-800' }
  if (age <= 25) return { label: `${age}년차`, className: 'bg-blue-50 text-blue-800' }
  return { label: `${age}년차`, className: 'bg-rose-50 text-rose-700' }
}

const scaleLabel = (households: number) => {
  if (households >= 1000) return '대단지'
  if (households >= 500) return '중대형 단지'
  if (households >= 200) return '중소형 단지'
  return '소규모 단지'
}

const buildingBars = (households: number) => households >= 1000 ? 3 : households >= 500 ? 2 : 1

export default function ApartmentCard({ apartment, academySummary, compact = false, onClick }: ApartmentCardProps) {
  const age = Math.max(apartment.age || (apartment.built_year ? new Date().getFullYear() - apartment.built_year : 0), 0)
  const ageState = ageTone(age)
  const parkingRatio = Math.max(apartment.parking_per_household || 0, 0)
  const parkingPercent = Math.min(parkingRatio / 1.5 * 100, 100)
  const totalAcademies = academySummary
    ? academySummary.core_institution_count + academySummary.extended_institution_count
    : null

  const content = (
    <>
      <span className="apartment-card__visual" aria-hidden="true">
        <Building2 size={20} />
        <span className="apartment-card__skyline">
          {Array.from({ length: buildingBars(apartment.households) }, (_, index) => <i key={index} />)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <strong className="block truncate text-[15px] text-gray-950">{apartment.name}</strong>
            <span className="mt-0.5 block text-xs text-gray-500">
              <b className="font-semibold text-gray-800">{apartment.households.toLocaleString()}세대</b>
              {apartment.building_count > 0 ? ` · ${apartment.building_count.toLocaleString()}개 동` : ''}
              {apartment.built_year ? ` · ${apartment.built_year}년` : ''}
            </span>
          </span>
          {onClick ? <ChevronRight className="mt-0.5 flex-none text-gray-400" size={18} aria-hidden="true" /> : null}
        </span>

        <span className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">{scaleLabel(apartment.households)}</span>
          {age > 0 ? <span className={`rounded px-2 py-1 text-[11px] font-semibold ${ageState.className}`}>{ageState.label}</span> : null}
          {totalAcademies != null ? (
            <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800">
              <GraduationCap size={12} aria-hidden="true" />학원 {totalAcademies.toLocaleString()}곳
            </span>
          ) : null}
        </span>

        {!compact ? (
          <span className="mt-3 block">
            <span className="flex items-center justify-between text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><CarFront size={13} aria-hidden="true" />세대당 주차</span>
              <strong className={parkingRatio >= 1 ? 'text-emerald-700' : parkingRatio >= 0.7 ? 'text-amber-700' : 'text-rose-700'}>{parkingRatio.toFixed(1)}대</strong>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full bg-teal-600" style={{ width: `${parkingPercent}%` }} />
            </span>
            <span className="mt-1 flex justify-between text-[11px] text-gray-500">
              <span>지상 {apartment.ground_parking.toLocaleString()}</span>
              <span>지하 {apartment.underground_parking.toLocaleString()}</span>
            </span>
          </span>
        ) : null}
      </span>
    </>
  )

  return onClick ? (
    <button type="button" onClick={onClick} className="apartment-card w-full text-left">{content}</button>
  ) : <div className="apartment-card">{content}</div>
}
