import { Building2, LoaderCircle, RefreshCw } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import type { Apartment, ApartmentAcademySummary } from '../../types'
import ApartmentCard from './ApartmentCard'

interface ApartmentListProps {
  apartments: Apartment[]
  loading?: boolean
  error?: string | null
  onApartmentSelect?: (apartment: Apartment) => void
  onRetry?: () => void
  academySummaries?: Record<string, ApartmentAcademySummary>
}

type SortField = 'name' | 'parking' | 'year' | 'households'

const SORT_OPTIONS = [
  { field: 'households', order: 'desc', label: '세대수 많은순' },
  { field: 'households', order: 'asc', label: '세대수 적은순' },
  { field: 'name', order: 'asc', label: '이름 가나다순' },
  { field: 'name', order: 'desc', label: '이름 역순' },
  { field: 'parking', order: 'desc', label: '주차 많은순' },
  { field: 'parking', order: 'asc', label: '주차 적은순' },
  { field: 'year', order: 'desc', label: '준공연도 최신순' },
  { field: 'year', order: 'asc', label: '준공연도 오래된순' },
] as const

const ApartmentList: React.FC<ApartmentListProps> = ({
  apartments,
  loading = false,
  error = null,
  onApartmentSelect,
  onRetry,
  academySummaries = {},
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
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3" data-testid="apartment-list-header">
        <h3 className="flex items-baseline gap-1 whitespace-nowrap font-semibold text-gray-950">
          배정 아파트 <span className="text-xs font-medium text-blue-700">{apartments.length}개 단지</span>
        </h3>
        <select
          aria-label="단지 정렬"
          value={`${sortBy}:${sortOrder}`}
          onChange={(event) => {
            const selected = SORT_OPTIONS.find(({ field, order }) => `${field}:${order}` === event.target.value)
            if (selected) { setSortBy(selected.field); setSortOrder(selected.order) }
          }}
          className="min-h-11 w-36 min-w-0 shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 text-xs font-medium text-blue-800"
        >
          {SORT_OPTIONS.map(({ field, order, label }) => <option key={`${field}:${order}`} value={`${field}:${order}`}>{label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-auto px-4">
        {sortedApartments.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            <Building2 className="mx-auto mb-3 text-gray-300" size={36} aria-hidden="true" />
            현재 조건에 표시할 배정 단지가 없습니다.
          </div>
        ) : <div className="space-y-2 py-3">{sortedApartments.map((apartment) => (
          <ApartmentCard
            key={apartment.id}
            apartment={apartment}
            academySummary={academySummaries[apartment.id]}
            onClick={() => onApartmentSelect?.(apartment)}
          />
        ))}</div>}
      </div>
    </div>
  )
}

export default ApartmentList
