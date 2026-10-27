import { useEffect, useState } from 'react'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { readPlans, subscribePlans } from '../../utils/schedule/plans'
import { displaySchoolName } from '../../utils/schoolName'
import { timetablePath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'

/**
 * MY의 시간표 칸 (2026-10-19). 짜는 일은 `/timetable`이 하고, 여기서는 이 기기에 있는 초안과
 * 어느 것이 내 시간표인지만 보여 주고 그 화면으로 보낸다. 두 화면이 같은 편집기를 갖지 않게 했다.
 */
export default function MyTimetableSummary({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [store, setStore] = useState(readPlans)
  useEffect(() => subscribePlans(() => setStore(readPlans())), [])
  // 내 시간표를 맨 위에, 나머지는 최근에 고친 순서로.
  const plans = [...store.plans].sort((a, b) =>
    Number(b.schoolId === store.activeSchoolId) - Number(a.schoolId === store.activeSchoolId) || b.updatedAt.localeCompare(a.updatedAt))

  return (
    <section className="my-timetable-summary my-card" aria-labelledby="my-timetable-title">
      <h2 id="my-timetable-title">우리 아이 시간표</h2>
      {plans.length ? (
        <ul className="my-timetable-summary__list">
          {plans.map((plan) => {
            const href = timetablePath(plan.schoolId)
            const extra = plan.entries.filter((entry) => entry.kind !== 'school').length
            return (
              <li key={plan.schoolId}>
                <a href={href} onClick={(event) => followLink(event, href, onNavigate)}>
                  <span className="min-w-0 flex-1">
                    <strong>{displaySchoolName(plan.schoolName)}</strong>
                    <small>{extra ? `방과후·돌봄·학원 등 ${extra}개` : '아직 고른 일정 없음'} · {plan.updatedAt.slice(0, 10)} 수정</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="my-help">아직 짠 시간표가 없어요. 학교를 고르면 하교·방과후·돌봄 시각을 바탕으로 한 주를 그려 볼 수 있어요.</p>
      )}
      <a href={timetablePath()} className="timetable-cta" onClick={(event) => followLink(event, timetablePath(), onNavigate)}>
        <CalendarClock size={18} aria-hidden="true" />
        <span>시간표 미리 짜보기</span>
        <ChevronRight size={18} aria-hidden="true" />
      </a>
    </section>
  )
}
