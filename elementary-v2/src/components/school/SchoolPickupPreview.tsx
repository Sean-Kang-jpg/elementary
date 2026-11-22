import { useEffect, useId, useRef, useState } from 'react'
import { getSchoolAfterschool, getSchoolDayEstimate } from '../../services/dataService'
import type { SchoolAfterschool, SchoolDayEstimate } from '../../types'
import { track } from '../../utils/analytics'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import { dismissalForPickup, pickupGap, pickupProgramOptions, pickupTimeMinutes } from '../../utils/schedule/pickupPreview'
import type { Weekday } from '../../utils/schedule/types'

const DAYS = [
  { value: 1, label: '월요일' }, { value: 2, label: '화요일' }, { value: 3, label: '수요일' },
  { value: 4, label: '목요일' }, { value: 5, label: '금요일' },
] as const

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours ? `${hours}시간` : '', remainder ? `${remainder}분` : ''].filter(Boolean).join(' ')
}

export default function SchoolPickupPreview({ schoolId, onContinue }: {
  schoolId: string
  onContinue: (weekday: Weekday, pickup: number) => void
}) {
  const titleId = useId()
  const [data, setData] = useState<{ day: SchoolDayEstimate | null; afterschool: SchoolAfterschool | null } | null>(null)
  const [weekday, setWeekday] = useState<Weekday>(5)
  const [pickupTime, setPickupTime] = useState('')
  const [checked, setChecked] = useState(false)
  const [optionIndex, setOptionIndex] = useState('')
  const reported = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([
      getSchoolDayEstimate(schoolId, { allowDevFixture: false }),
      getSchoolAfterschool(schoolId, { allowDevFixture: false }),
    ]).then(([day, afterschool]) => {
      if (active) setData({
        day: day.status === 'fulfilled' ? day.value.day : null,
        afterschool: afterschool.status === 'fulfilled' ? afterschool.value : null,
      })
    })
    return () => { active = false }
  }, [schoolId])

  const pickup = pickupTimeMinutes(pickupTime)
  const dismissal = dismissalForPickup(data?.day ?? null, weekday)
  const gap = checked && data && pickup !== null ? pickupGap(pickup, dismissal) : null
  const result = gap?.result
  useEffect(() => {
    if (!result) { reported.current = null; return }
    const current = `${schoolId}:${weekday}:${result}`
    if (reported.current === current) return
    reported.current = current
    track('pickup_gap_check', { weekday, result })
  }, [result, schoolId, weekday])

  const options = dismissal === null ? [] : pickupProgramOptions(data?.afterschool ?? null, weekday, dismissal)
  const option = optionIndex === '' ? undefined : options[Number(optionIndex)]
  const showPrograms = gap?.result === 'gap' || gap?.result === 'same'

  return (
    <section className="my-card border border-indigo-200 bg-indigo-50 px-4 py-3" aria-labelledby={titleId} data-testid="school-pickup-preview">
      <h2 id={titleId} className="text-base font-semibold text-indigo-950">초1 오후 미리보기</h2>
      <p className="mt-1 text-sm text-gray-700">예상 하교 시각과 우리 집 픽업 시각을 맞춰 봐요.</p>
      {data?.day && (
        <ol aria-label="요일별 예상 하교 시각" className="mt-2 grid grid-cols-5 gap-1 text-center text-xs text-gray-700">
          {DAYS.map(({ value, label }) => {
            const time = dismissalForPickup(data.day, value)
            return <li key={value}>{label.slice(0, 1)}<strong className="block">{time === null ? '미확인' : formatMinutes(time)}</strong></li>
          })}
        </ol>
      )}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault()
        if (pickup !== null) setChecked(true)
      }}>
        <label className="grid gap-1 text-xs font-semibold text-gray-700">요일
          <select className="min-h-11 rounded-md border border-gray-300 bg-white px-2 text-sm" value={weekday}
            onChange={(event) => { setWeekday(Number(event.currentTarget.value) as Weekday); setOptionIndex('') }}>
            {DAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-700">픽업 가능 시각
          <input className="min-h-11 max-w-full rounded-md border border-gray-300 bg-white px-2 text-sm" required type="time" value={pickupTime}
            onChange={(event) => { setPickupTime(event.currentTarget.value); setChecked(false) }} />
        </label>
        <button className="min-h-11 rounded-md bg-indigo-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
          type="submit" disabled={!data}>비는 시간 보기</button>
      </form>
      <div role="status" className="mt-2 space-y-1 text-sm text-indigo-950" data-testid="school-pickup-result">
        {!data && <p>학교 자료를 불러오는 중이에요.</p>}
        {gap?.result === 'unknown' && <p>이 요일의 하교 시각이 미확인이에요. 학교 공지나 가정통신문에서 먼저 확인해 주세요.</p>}
        {gap?.result === 'early' && <p>입력한 픽업 시각이 예상 하교보다 빨라요. 하교 시각과 픽업 시간을 확인해 주세요.</p>}
        {gap?.result === 'same' && <p>입력한 픽업 시각이 예상 하교 시각과 같아요.</p>}
        {gap?.result === 'gap' && <p>하교 직후부터 보면 <strong>{duration(gap.minutes)}</strong>을 더 살펴봐야 해요.</p>}
        {gap && gap.result !== 'unknown' && data?.day && <p className="text-xs">{data.day.source_year}학년도 자료로 예상한 하교 시각이에요.</p>}
        {gap?.result === 'gap' && options.length === 0 && <p className="text-xs">학교에 이 시간에 이용할 수 있는 방과후·돌봄이 있는지 확인해 보세요.</p>}
      </div>
      {showPrograms && options.length > 0 && (
        <label className="mt-3 grid max-w-full gap-1 text-xs font-semibold text-gray-700">참여한다면 어떻게 달라질까요?
          <select className="min-h-11 min-w-0 max-w-full rounded-md border border-gray-300 bg-white px-2 text-sm" value={optionIndex}
            onChange={(event) => setOptionIndex(event.currentTarget.value)}>
            <option value="">운영계획의 시간대 고르기</option>
            {options.map((item, index) => <option key={index} value={index}>
              {item.kind === '맞춤형' ? '맞춤형' : '저학년 방과후'} {formatMinutes(item.start)}~{formatMinutes(item.end)}{item.estimated ? ' (추정)' : ''}
            </option>)}
          </select>
        </label>
      )}
      {showPrograms && option && pickup !== null && dismissal !== null && (
        <div role="status" className="mt-2 space-y-1 text-xs text-gray-700">
          {pickup < option.end ? <p>픽업 시각이 이 시간대 종료보다 빨라요. 시작과 종료 시각, 중간 귀가 가능 여부를 확인해 주세요.</p>
            : <p>이 시간대에 참여한다면 {option.start > dismissal ? `활동 전 ${duration(option.start - dismissal)}` : '하교 후 바로 시작'} · {pickup > option.end ? `활동 후 ${duration(pickup - option.end)}` : '종료 시 픽업'}이에요.</p>}
          <p>{data?.afterschool?.source_year}학년도 운영계획 기준이에요. 실제 개설·참여는 학교에 확인해 주세요.</p>
        </div>
      )}
      {gap && pickup !== null && (
        <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-indigo-800 underline" onClick={() => onContinue(weekday, pickup)}>
          이 요일부터 한 주 짜보기
        </button>
      )}
    </section>
  )
}
