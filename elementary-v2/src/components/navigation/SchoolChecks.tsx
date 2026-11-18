import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { schoolChecks } from '../../utils/schedule/schoolChecks'

export default function SchoolChecks({ entries, onInspect }: {
  entries: readonly ScheduleEntry[]
  onInspect: (entryId: string, weekday: Weekday) => void
}) {
  const checks = schoolChecks(entries)
  if (!checks.length) return null
  return <section className="school-checks" aria-labelledby="school-checks-title" data-testid="school-checks">
    <h3 id="school-checks-title">학교에 확인할 것 · {checks.length}개</h3>
    <p className="my-help">시간표를 채워도 신청·참여가 확정되는 것은 아니에요. 학기 중 일정에서 확인할 내용을 모았어요.</p>
    <ul>{checks.map(check => <li key={check.id}>
      <strong>{check.title}</strong>
      {check.reasons.map(reason => <p key={reason}>{reason}</p>)}
      {check.entryId && check.weekday && <button type="button" className="my-button" aria-label={`${check.title} 일정에서 확인`}
        onClick={() => onInspect(check.entryId!, check.weekday!)}>일정에서 확인</button>}
    </li>)}</ul>
  </section>
}
