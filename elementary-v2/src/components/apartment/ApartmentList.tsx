import { Building2, CarFront, ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { Apartment } from '../../types'

interface ApartmentListProps {
  apartments: Apartment[]
  loading?: boolean
  error?: string | null
  onApartmentSelect?: (apartment: Apartment) => void
  onRetry?: () => void
}

type SortField = 'name' | 'parking' | 'year' | 'households'

const ApartmentList: React.FC<ApartmentListProps> = ({
  apartments,
  loading = false,
  error = null,
  onApartmentSelect,
  onRetry,
}) => {
  const [sortBy, setSortBy] = useState<SortField>('households')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const sortedApartments = useMemo(() => [...apartments].sort((a, b) => {
    const values: Record<SortField, [string | number, string | number]> = {
      name: [a.name || '', b.name || ''],
      parking: [a.parking_per_household || 0, b.parking_per_household || 0],
      year: [a.built_year || 0, b.built_year || 0],
      households: [a.households || 0, b.households || 0],
    }
    const [aValue, bValue] = values[sortBy]
    const result = typeof aValue === 'string'
      ? aValue.localeCompare(String(bValue), 'ko')
      : Number(aValue) - Number(bValue)
    return sortOrder === 'asc' ? result : -result
  }), [apartments, sortBy, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortOrder((order) => order === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(field)
      setSortOrder(field === 'name' ? 'asc' : 'desc')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-600">
        <LoaderCircle className="mr-2 animate-spin text-blue-600" size={20} aria-hidden="true" />
        배정 단지를 불러오는 중
      </div>
    )
  }

  if (error) return (
    <div className="m-4 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-4" role="alert">
      <span className="min-w-0 flex-1 text-sm text-amber-900">{error}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700">
          <RefreshCw size={15} aria-hidden="true" />
          다시 시도
        </button>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-950">배정 아파트</h3>
          <span className="text-sm font-medium text-blue-700">{apartments.length}개 단지</span>
        </div>
        <div className="flex gap-1 overflow-x-auto" aria-label="단지 정렬">
          {([
            ['households', '세대수'],
            ['name', '이름'],
            ['parking', '주차'],
            ['year', '준공연도'],
          ] as const).map(([field, label]) => (
            <button
              key={field}
              type="button"
              onClick={() => handleSort(field)}
              className={`flex-none rounded-md border px-3 py-1.5 text-xs font-medium ${sortBy === field ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              aria-pressed={sortBy === field}
            >
              {label}{sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4">
        {sortedApartments.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            <Building2 className="mx-auto mb-3 text-gray-300" size={36} aria-hidden="true" />
            현재 조건에 표시할 배정 단지가 없습니다.
          </div>
        ) : sortedApartments.map((apartment) => (
          <button
            key={apartment.id}
            type="button"
            onClick={() => onApartmentSelect?.(apartment)}
            className="flex w-full items-center gap-3 border-b border-gray-100 py-4 text-left hover:bg-gray-50"
          >
            <Building2 className="flex-none text-gray-400" size={20} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-950">{apartment.name}</span>
              <span className="mt-1 block truncate text-xs text-gray-500">{apartment.address || '주소 정보 없음'}</span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700">
                <span>{apartment.households.toLocaleString()}세대</span>
                <span>{apartment.built_year ? `${apartment.built_year}년 준공` : '준공연도 미확인'}</span>
                <span className="inline-flex items-center gap-1">
                  <CarFront size={12} aria-hidden="true" />
                  지상 {apartment.ground_parking.toLocaleString()}대 · 지하 {apartment.underground_parking.toLocaleString()}대
                </span>
                <span>세대당 {apartment.parking_per_household.toFixed(1)}대</span>
              </span>
            </span>
            <ChevronRight className="flex-none text-gray-400" size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ApartmentList
