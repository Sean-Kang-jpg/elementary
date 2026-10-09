import { Clock } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import type { School, SchoolCareHours, SchoolDayEstimate } from '../../types'
import { getSchoolDayEstimate } from '../../services/dataService'
import { track } from '../../utils/analytics'
import { useSeenOnce } from '../care/useSeenOnce'
import { followLink } from '../content/contentLinks'
import { guidePath } from '../../utils/urlState'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'] as const
const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null)

/**
 * "초1 하루 예상" (SQL 26, A2-R04).
 *
 * 전년도 학교알리미 시정표 × NEIS 1학년 교시 수로 만든 요일별 예상 하교와,
 * 학교 돌봄 운영 시간을 함께 보여준다. 값은 모두 검수를 거친 것이고, 확정이 아니라
 * '예상'이다(2025→2026 비교에서 요일 패턴 94%, 시정표 96%가 그대로였다).
 * 추론한 시각은 '추정', 출처가 정하지 못한 요일·학교는 '학교 확인'으로 둔다 — 빈칸을
 * 다른 값으로 채우지 않는다. 돌봄은 기본 운영과 저녁·연장을 나눠 쓴다(2026-10-08 결정).
 */
const SchoolDayEstimateCard: React.FC<{ school: School; onOpenGuide: (path: string) => void }> = ({ school, onOpenGuide }) => {
  const [day, setDay] = useState<SchoolDayEstimate | null>(null)
  const [care, setCare] = useState<SchoolCareHours | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useSeenOnce(sectionRef, day || care ? school.school_id : null, () => {
    track('view_school_day_estimate', {
      item_type: 'school',
      item_id: school.school_id,
      has_day: day ? 'yes' : 'no',
      care_status: care?.status ?? 'none',
    })
  })

  useEffect(() => {
    setDay(null)
    setCare(null)
    let active = true
    getSchoolDayEstimate(school.school_id)
      .then((result) => {
        if (!active) return
        setDay(result.day)
        setCare(result.care)
      })
      .catch((error) => console.error('초1 하루 예상 조회 실패:', error))
    return () => { active = false }
  }, [school.school_id])

  if (!day && !care) return null
  const sourceYear = day?.source_year ?? care?.source_year

  return (
    <section ref={sectionRef} aria-labelledby="school-day-title" data-testid="school-day-estimate">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 id="school-day-title" className="inline-flex items-center gap-2 font-semibold text-gray-950">
          <Clock size={18} aria-hidden="true" />초1 하루 예상
        </h3>
        <span className="text-xs text-gray-500">{sourceYear}학년도 기준 · 예상</span>
      </div>

      {day && (
        <>
          <ol className="grid grid-cols-5 gap-1.5" aria-label="요일별 예상 하교 시각">
            {day.weekdays.map((weekday) => {
              const label = WEEKDAY_LABELS[weekday.weekday - 1]
              const unsettled = weekday.note === 'school_check_needed'
              return (
                <li
                  key={weekday.weekday}
                  className={`rounded-md px-1 py-2 text-center ${unsettled ? 'bg-gray-50 text-gray-500' : 'bg-indigo-50 text-indigo-950'}`}
                  data-testid="school-day-weekday"
                >
                  <span className="block text-[11px] font-medium">{label}{weekday.periods ? ` · ${weekday.periods}교시` : ''}</span>
                  <strong className="mt-0.5 block text-sm">{unsettled ? '학교 확인' : hhmm(weekday.dismissal)}</strong>
                  {weekday.note === 'inferred' && <span className="block text-[10px] text-indigo-700">추정</span>}
                </li>
              )
            })}
          </ol>
          <p className="mt-2 text-xs leading-5 text-gray-700">
            {day.lunch_position === 'after_p4'
              ? `4교시인 날은 점심(${hhmm(day.lunch_start)}~${hhmm(day.lunch_end)})을 먹고 하교해요.`
              : `1학년은 4교시 전에 점심(${hhmm(day.lunch_start)}~${hhmm(day.lunch_end)})을 먹어요. 4교시인 날은 수업이 끝나면 하교해요.`}
            {' '}입학 첫 1~2주는 하교가 더 이른 학교가 많아요.{' '}
            <a href={guidePath('first-weeks')} onClick={(event) => followLink(event, guidePath('first-weeks'), onOpenGuide)} className="font-semibold text-indigo-800 underline underline-offset-2">
              입학 첫 주 알아보기
            </a>
          </p>
        </>
      )}

      {care && (
        <div className={day ? 'mt-3' : ''}>
          <h4 className="mb-1.5 text-sm font-semibold text-gray-900">학교 돌봄 운영 시간</h4>
          {care.status === 'stated' ? (
            <dl className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-gray-600">오후 돌봄</dt>
                <dd className="font-semibold text-gray-950">방과후 ~ {hhmm(care.afternoon_end)}</dd>
              </div>
              {care.extended_end && (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="shrink-0 text-gray-600">저녁·연장</dt>
                  <dd className="text-right">
                    <span className="font-semibold text-gray-950">~ {hhmm(care.extended_end)}</span>
                    {care.extended_condition && <span className="block text-[11px] text-gray-500">{care.extended_condition}</span>}
                  </dd>
                </div>
              )}
              {care.morning_hours && (
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-gray-600">아침 돌봄</dt>
                  <dd className="font-semibold text-gray-950">{care.morning_hours.replace('-', ' ~ ')}</dd>
                </div>
              )}
              {care.grades && (
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-gray-600">대상</dt>
                  <dd className="text-gray-950">{care.grades}학년</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">공시에 돌봄 운영 시간이 없어요. 학교에 확인해 주세요.</p>
          )}
          {care.status === 'stated' && (
            <p className="mt-1.5 text-[11px] leading-4 text-gray-500">돌봄은 정원과 선발 순위가 있어, 신청해도 이용하지 못할 수 있어요.</p>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-4 text-gray-500">
        출처: {[day?.clock_source, day && day.periods_source !== '없음' ? day.periods_source : null, care?.source].filter(Boolean).join(' · ')}.
        {' '}학교 사정으로 바뀔 수 있어요.
      </p>
    </section>
  )
}

export default SchoolDayEstimateCard
