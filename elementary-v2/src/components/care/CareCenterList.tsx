import { HeartHandshake, LoaderCircle, Phone } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import type { CareCenter } from '../../types'
import { getCareCentersNear } from '../../services/dataService'

interface CareCenterListProps {
  latitude: number
  longitude: number
  /** 기준점 이름 — "단지" 또는 "학교". 거리 설명에 쓴다. */
  originLabel: string
  headingId: string
}

const RADIUS_M = 1000
const INITIAL_COUNT = 3

const formatHours = (value: string | null) => value ? value.replace('~', ' ~ ') : '미입력'
const formatDistance = (meters: number) => meters < 1000 ? `${meters.toLocaleString()}m` : `${(meters / 1000).toFixed(1)}km`

/**
 * 1km 안의 다함께돌봄센터·우리동네키움센터 (SQL 23). 방학 운영시간이 이 목록의
 * 핵심이다 — 학교 돌봄이 끝나는 방학에 맞벌이 가정이 가장 먼저 찾는 정보다.
 * SQL 23이 없는 DB에서는 빈 목록이 오고, 그때는 아무것도 그리지 않는다.
 */
const CareCenterList: React.FC<CareCenterListProps> = ({ latitude, longitude, originLabel, headingId }) => {
  const [centers, setCenters] = useState<CareCenter[] | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setCenters(null)
    setExpanded(false)
    if (!latitude || !longitude) return
    let active = true
    getCareCentersNear(latitude, longitude, RADIUS_M)
      .then((rows) => { if (active) setCenters(rows) })
      .catch((error) => {
        console.error('주변 돌봄센터 조회 실패:', error)
        if (active) setCenters([])
      })
    return () => { active = false }
  }, [latitude, longitude])

  if (!latitude || !longitude) return null
  if (centers === null) {
    return (
      <section aria-labelledby={headingId}>
        <h3 id={headingId} className="mb-2 inline-flex items-center gap-2 font-semibold text-gray-950"><HeartHandshake size={18} aria-hidden="true" />주변 돌봄센터</h3>
        <LoaderCircle className="animate-spin text-blue-600" size={18} aria-label="주변 돌봄센터 불러오는 중" />
      </section>
    )
  }

  const visible = expanded ? centers : centers.slice(0, INITIAL_COUNT)

  return (
    <section aria-labelledby={headingId} data-testid="care-centers">
      <div className="mb-2 flex items-center justify-between">
        <h3 id={headingId} className="inline-flex items-center gap-2 font-semibold text-gray-950"><HeartHandshake size={18} aria-hidden="true" />주변 돌봄센터</h3>
        <strong className="text-sm text-rose-800">{centers.length}곳</strong>
      </div>
      {centers.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-4 text-center text-sm text-gray-600">{originLabel} 1km 안에 등록된 돌봄센터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {visible.map((center) => (
            <li key={center.center_id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-gray-950">{center.name}</strong>
                  <span className="text-[11px] text-gray-500">{center.center_kind} · {formatDistance(center.straight_distance_m)}{center.capacity ? ` · 정원 ${center.capacity}명` : ''}</span>
                </span>
                {center.phone ? (
                  <a href={`tel:${center.phone}`} className="flex-none rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label={`${center.name} 전화`}><Phone size={16} aria-hidden="true" /></a>
                ) : null}
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-gray-50 px-2 py-1"><dt className="text-gray-500">학기 중</dt><dd className="font-semibold text-gray-900">{formatHours(center.term_hours)}</dd></div>
                <div className="rounded bg-rose-50 px-2 py-1"><dt className="text-rose-700">방학 중</dt><dd className="font-semibold text-rose-900">{formatHours(center.vacation_hours)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {centers.length > INITIAL_COUNT ? (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 h-9 w-full rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {expanded ? '접기' : `${centers.length - INITIAL_COUNT}곳 더 보기`}
        </button>
      ) : null}
      <p className="mt-2 text-[11px] leading-4 text-gray-500">
        {originLabel} 기준 직선거리 1km. 다함께돌봄사업 지원단 센터 현황에 센터가 직접 입력한 정보라 최신이 아닐 수 있습니다. 이용 전 센터에 확인하세요.
      </p>
    </section>
  )
}

export default CareCenterList
