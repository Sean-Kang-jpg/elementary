import { Baby, ChevronRight } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import type { School, SchoolCareStatistics } from '../../types'
import { getSchoolCareStatistics } from '../../services/dataService'
import { currentDetailEntry, track } from '../../utils/analytics'
import { useSeenOnce } from './useSeenOnce'

const count = (value: number | null | undefined) => value ?? 0
const disclosed = (value: number | null | undefined): value is number => value != null

// 전교생이 이보다 적은 학교는 돌봄을 전 학년에 여는 경우가 흔해, 1·2학년 대비
// 이용률이 뜻을 잃는다. 운영 데이터(2026-10-04)에서 100%를 넘는 학교 1,473곳은
// 거의 전부 이 구간이었다(60명 미만 75%, 60~120명 42%, 300명 이상 1% 이하).
const SMALL_SCHOOL_STUDENTS = 120

/**
 * 학교 돌봄·방과후 (학교알리미 공시, SQL 23).
 *
 * 공시에는 신청·탈락 인원도, 돌봄 참여의 학년 구분도 없다. 돌봄은 신청 후
 * 선정되는 구조라, 1·2학년 학생 수 대비 참여 인원(이용률)과 교실당 인원을
 * 들어가기 쉬운 정도의 간접 지표로 보여준다. 둘을 점수로 합치지 않는다 — 학교
 * 순위를 만들지 않는다는 신뢰 원칙 때문이다.
 */
const CARE_GUIDE_PATH = '/guide/care-afterschool'

interface SchoolCarePanelProps {
  school: School
  onOpenGuide: (path: string) => void
  /** "초1 하루·오후" 카드 안에 들어갈 때: 카드가 이미 읽은 공시를 받고, 섹션 머리말 없이 그린다. */
  embedded?: boolean
  stats?: SchoolCareStatistics | null
  /** 학교의 1학년 강좌 목록을 따로 보여 줄 때는 공시의 방과후 프로그램 수(전 학년)를 빼서 숫자가 겹치지 않게 한다. */
  hideProgramCount?: boolean
}

const SchoolCarePanel: React.FC<SchoolCarePanelProps> = ({ school, onOpenGuide, embedded = false, stats: givenStats, hideProgramCount = false }) => {
  const [fetchedStats, setStats] = useState<SchoolCareStatistics | null>(null)
  const stats = embedded ? givenStats ?? null : fetchedStats
  const sectionRef = useRef<HTMLDivElement>(null)

  useSeenOnce(sectionRef, stats ? school.school_id : null, () => {
    track('view_care', {
      item_type: 'school',
      item_id: school.school_id,
      block: 'school_care',
      has_evening_care: stats && count(stats.evening_care_rooms) > 0 ? 'yes' : 'no',
    })
  })

  useEffect(() => {
    if (embedded) return
    setStats(null)
    let active = true
    getSchoolCareStatistics(school.school_id)
      .then((row) => { if (active) setStats(row) })
      .catch((error) => console.error('돌봄·방과후 공시 조회 실패:', error))
    return () => { active = false }
  }, [school.school_id, embedded])

  if (!stats) return null

  const careRooms = stats.afternoon_care_rooms
  const careStudents = stats.afternoon_care_students
  const lowerGrades = count(school.grade1_students) + count(school.grade2_students)
  const allGrades = [1, 2, 3, 4, 5, 6].reduce((sum, grade) => sum + count(school[`grade${grade}_students` as keyof School] as number), 0)
  const usageRate = lowerGrades > 0 && disclosed(careStudents) && careStudents > 0 ? Math.round(careStudents / lowerGrades * 100) : null
  // 100%를 넘는다는 것 자체가 다른 학년이 섞였다는 뜻이다. 1·2학년이 많아서는
  // 넘을 수 없다 — 그들은 분모다.
  const allGradeCare = (allGrades > 0 && allGrades < SMALL_SCHOOL_STUDENTS) || (usageRate != null && usageRate > 100)
  const perRoom = disclosed(careRooms) && careRooms > 0 && disclosed(careStudents) ? Math.round(careStudents / careRooms) : null
  const eveningRooms = stats.evening_care_rooms
  const programs = count(stats.afterschool_aptitude_programs) + count(stats.afterschool_curriculum_programs)

  const Wrapper = embedded ? 'div' : 'section'
  return (
    <Wrapper ref={sectionRef} aria-labelledby={embedded ? undefined : 'school-care-title'} data-testid="school-care" className={embedded ? 'mt-2' : undefined}>
      {embedded ? (
        <p className="mb-1.5 text-xs text-gray-500">공시 현황 · 학교알리미 {stats.statistics_year}년</p>
      ) : (
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id="school-care-title" className="inline-flex items-center gap-2 font-semibold text-gray-950"><Baby size={18} aria-hidden="true" />돌봄·방과후</h3>
          <span className="text-xs text-gray-500">학교알리미 {stats.statistics_year}년 공시</span>
        </div>
      )}
      {!disclosed(careRooms) ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">오후 돌봄교실 수가 공시 원문에 없거나 확인되지 않았습니다.</p>
      ) : careRooms === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">공시값은 오후 돌봄교실 0실입니다. 실제 운영 여부는 학교에 확인하세요.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-rose-50 p-2.5 text-center">
            <span className="block text-[11px] text-rose-700">오후 돌봄</span>
            <strong className="mt-0.5 block text-base text-rose-950">{careRooms}실 · {disclosed(careStudents) ? `${careStudents.toLocaleString()}명` : '인원 미공시'}</strong>
          </div>
          <div className="rounded-md bg-gray-100 p-2.5 text-center">
            {allGradeCare ? <>
              <span className="block text-[11px] text-gray-600">{usageRate != null && usageRate > 100 ? '참여 학년' : '소규모 학교'}</span>
              <strong className="mt-0.5 block text-base text-gray-950">{usageRate != null && usageRate > 100 ? '전 학년 포함' : '전 학년 흔함'}</strong>
            </> : <>
              <span className="block text-[11px] text-gray-600">1·2학년 대비 이용률</span>
              <strong className="mt-0.5 block text-base text-gray-950">{usageRate != null ? `${usageRate}%` : '-'}</strong>
            </>}
          </div>
          <div className="rounded-md bg-gray-100 p-2.5 text-center">
            <span className="block text-[11px] text-gray-600">교실당</span>
            <strong className="mt-0.5 block text-base text-gray-950">{perRoom != null ? `${perRoom}명` : '-'}</strong>
          </div>
        </div>
      )}
      <dl className={`mt-2 grid gap-2 text-sm ${hideProgramCount ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
          <dt className="text-gray-600">별도 저녁돌봄 교실</dt>
          <dd className={`font-semibold ${disclosed(eveningRooms) && eveningRooms > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{!disclosed(eveningRooms) ? '미공시·미확인' : eveningRooms > 0 ? `공시 ${eveningRooms}실` : '공시 0실'}</dd>
        </div>
        {!hideProgramCount && (
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <dt className="text-gray-600">방과후 프로그램</dt>
            <dd className="font-semibold text-gray-950">{programs.toLocaleString()}개</dd>
          </div>
        )}
      </dl>
      {/* 모바일 한 줄(2026-10-24). 계산 방법은 돌봄 가이드에 있다. */}
      <p className="mt-2 text-[11px] leading-4 text-gray-500">
        {allGradeCare ? '신청·탈락 인원은 비공시 · 전 학년 운영이라 이용률 생략' : '신청·탈락 인원은 비공시 · 이용률은 참고값(여석 아님)'}
      </p>
      <a
        href={CARE_GUIDE_PATH}
        onClick={(event) => {
          event.preventDefault()
          track('click_care_guide', { school_id: school.school_id, guide_id: 'care-afterschool', entry_source: currentDetailEntry() ?? undefined })
          onOpenGuide(CARE_GUIDE_PATH)
        }}
        className="mt-2 flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        data-testid="care-guide-link"
      >
        늘봄·돌봄, 무엇을 언제 신청하나요
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    </Wrapper>
  )
}

export default SchoolCarePanel
