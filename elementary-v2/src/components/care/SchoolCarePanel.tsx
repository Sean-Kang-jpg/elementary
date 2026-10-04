import { Baby } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import type { School, SchoolCareStatistics } from '../../types'
import { getSchoolCareStatistics } from '../../services/dataService'

const count = (value: number | null | undefined) => value ?? 0

/**
 * 학교 돌봄·방과후 (학교알리미 공시, SQL 23).
 *
 * 공시에는 신청·탈락 인원이 없다. 돌봄은 신청 후 선정되는 구조라, 1·2학년
 * 학생 수 대비 참여 인원("100명당")과 교실당 인원을 들어가기 쉬운 정도의
 * 간접 지표로 보여준다. 둘을 점수로 합치지 않는다 — 학교 순위를 만들지 않는다는
 * 신뢰 원칙 때문이다.
 */
const SchoolCarePanel: React.FC<{ school: School }> = ({ school }) => {
  const [stats, setStats] = useState<SchoolCareStatistics | null>(null)

  useEffect(() => {
    setStats(null)
    let active = true
    getSchoolCareStatistics(school.school_id)
      .then((row) => { if (active) setStats(row) })
      .catch((error) => console.error('돌봄·방과후 공시 조회 실패:', error))
    return () => { active = false }
  }, [school.school_id])

  if (!stats) return null

  const careRooms = count(stats.afternoon_care_rooms)
  const careStudents = count(stats.afternoon_care_students)
  const lowerGrades = count(school.grade1_students) + count(school.grade2_students)
  const per100 = lowerGrades > 0 && careStudents > 0 ? Math.round(careStudents / lowerGrades * 100) : null
  const perRoom = careRooms > 0 ? Math.round(careStudents / careRooms) : null
  const eveningRooms = count(stats.evening_care_rooms)
  const programs = count(stats.afterschool_aptitude_programs) + count(stats.afterschool_curriculum_programs)

  return (
    <section aria-labelledby="school-care-title" data-testid="school-care">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 id="school-care-title" className="inline-flex items-center gap-2 font-semibold text-gray-950"><Baby size={18} aria-hidden="true" />돌봄·방과후</h3>
        <span className="text-xs text-gray-500">학교알리미 {stats.statistics_year}년 공시</span>
      </div>
      {careRooms === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">공시된 오후 돌봄교실이 없습니다. 학교나 교육청 늘봄 안내를 확인하세요.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-rose-50 p-2.5 text-center">
            <span className="block text-[11px] text-rose-700">오후 돌봄</span>
            <strong className="mt-0.5 block text-base text-rose-950">{careRooms}실 · {careStudents.toLocaleString()}명</strong>
          </div>
          <div className="rounded-md bg-gray-100 p-2.5 text-center">
            <span className="block text-[11px] text-gray-600">1·2학년 100명당</span>
            <strong className="mt-0.5 block text-base text-gray-950">{per100 != null ? `${per100}명` : '-'}</strong>
          </div>
          <div className="rounded-md bg-gray-100 p-2.5 text-center">
            <span className="block text-[11px] text-gray-600">교실당</span>
            <strong className="mt-0.5 block text-base text-gray-950">{perRoom != null ? `${perRoom}명` : '-'}</strong>
          </div>
        </div>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
          <dt className="text-gray-600">저녁 돌봄</dt>
          <dd className={`font-semibold ${eveningRooms > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{eveningRooms > 0 ? `운영 ${eveningRooms}실` : '공시 없음'}</dd>
        </div>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
          <dt className="text-gray-600">방과후 프로그램</dt>
          <dd className="font-semibold text-gray-950">{programs.toLocaleString()}개</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-gray-500">
        돌봄 신청·탈락 인원은 공시되지 않습니다. 1·2학년 학생 대비 참여 인원이 적고 교실당 인원이 많을수록 자리가 빠듯한 편입니다. 참여 인원에 다른 학년이 포함될 수 있습니다.
      </p>
    </section>
  )
}

export default SchoolCarePanel
