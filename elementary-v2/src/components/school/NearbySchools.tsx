import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { School } from '../../types'
import { getNearbySchools } from '../../services/dataService'
import { nearbySummary, type NearbySchool } from '../../utils/nearbySchools'
import { areaPath, schoolPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import { markEntry } from '../../utils/analytics'
import { displaySchoolName } from '../../utils/schoolName'

interface NearbySchoolsProps {
  school: School
  onNavigate: (path: string) => void
}

/**
 * 인근 학교와 비교. 가장 가까운 다섯 곳과 1학년 학생 수·학급당 학생 수·전교생을
 * 나란히 놓는다. 프리렌더(api/detail.js)도 같은 표를 그린다 — 학교마다 다른 문장과
 * 수치가 상세 페이지를 서로 구별되게 한다.
 *
 * 아래에 이 학교가 속한 시·군·구 허브로 가는 길을 둔다. 다섯 곳보다 넓게 보고 싶은
 * 사람과, 허브를 따라 다른 학교로 가는 검색엔진이 함께 쓴다.
 */
export default function NearbySchools({ school, onNavigate }: NearbySchoolsProps) {
  const [nearby, setNearby] = useState<NearbySchool[] | null>(null)

  useEffect(() => {
    let active = true
    setNearby(null)
    getNearbySchools(school)
      .then((rows) => { if (active) setNearby(rows) })
      .catch((error) => {
        // 비교는 덧붙인 정보다. 실패하면 이 구역만 빠진다.
        console.error('인근 학교 조회 실패:', error)
        if (active) setNearby([])
      })
    return () => { active = false }
  }, [school])

  if (!nearby || !nearby.length) return null
  const summary = nearbySummary(school, nearby.map((row) => row.school))
  const hub = areaPath(school)
  const hubLabel = school.region === '세종특별자치시' ? '세종' : school.district

  const rows: Array<{ school: School; distanceKm: number | null }> = [{ school, distanceKm: null }, ...nearby]

  return (
    <section aria-labelledby="nearby-schools-title" data-testid="nearby-schools">
      <h3 id="nearby-schools-title" className="mb-1 font-semibold text-gray-950">인근 학교와 비교</h3>
      {summary && <p className="mb-2 text-sm text-gray-600">{summary}</p>}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">학교</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">거리</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">1학년</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">학급당</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">전교생</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ school: row, distanceKm }) => {
              const current = distanceKm == null
              const path = schoolPath(row)
              const type = row.establishment_type && row.establishment_type !== '공립' ? ` (${row.establishment_type})` : ''
              return (
                <tr key={row.school_id} className={`border-t border-gray-100 ${current ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-800'}`} aria-current={current || undefined}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {current ? displaySchoolName(row.school_name, row.establishment_type) : (
                      <a
                        href={path}
                        onClick={(event) => {
                          markEntry('related')
                          followLink(event, path, onNavigate)
                        }}
                        className="text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        {displaySchoolName(row.school_name, row.establishment_type)}
                      </a>
                    )}
                    {type && <span className="text-xs font-normal text-gray-500">{type}</span>}
                  </th>
                  <td className="px-2 py-2 text-right">{current ? '-' : `${distanceKm.toFixed(1)}km`}</td>
                  <td className="px-2 py-2 text-right">{row.grade1_students ? row.grade1_students.toLocaleString() : '-'}</td>
                  <td className="px-2 py-2 text-right">{row.grade1_per_class || '-'}</td>
                  <td className="px-3 py-2 text-right">{row.total_students ? row.total_students.toLocaleString() : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hubLabel && (
        <a
          href={hub}
          onClick={(event) => followLink(event, hub, onNavigate)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          {hubLabel} 초등학교 전체 비교
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      )}
    </section>
  )
}
