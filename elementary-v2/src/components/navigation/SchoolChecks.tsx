import { BookOpen, ChevronRight, ClipboardCheck, Clock3, HelpCircle, School, ShieldCheck, UserRound } from 'lucide-react'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { schoolChecks } from '../../utils/schedule/schoolChecks'

const DAY_NAMES = ['월', '화', '수', '목', '금']
const daysLabel = (days?: Weekday[]) => !days ? null : days.length === 5 ? '월~금' : days.map(day => DAY_NAMES[day - 1]).join('·')
const FACT_LABELS = { missing: '시간 확인 필요', estimate: '실제 시간 확인', assumption: '기본 가정', participation: '참여 확인' }
const FACT_ICONS = { missing: HelpCircle, estimate: Clock3, assumption: Clock3, participation: UserRound }
const ITEM_ICONS = { dismissal: School, care: ShieldCheck, afterschool: BookOpen }

export default function SchoolChecks({ entries, onInspect }: {
  entries: readonly ScheduleEntry[]
  onInspect: (entryId: string, weekday: Weekday) => void
}) {
  const checks = schoolChecks(entries)
  if (!checks.length) return null
  return <section className="school-checks" aria-labelledby="school-checks-title" data-testid="school-checks">
    <div className="school-checks__heading">
      <span className="school-checks__heading-icon"><ClipboardCheck size={21} aria-hidden="true" /></span>
      <div><h3 id="school-checks-title">학교에 확인할 것 <span className="school-checks__count">{checks.length}<span className="sr-only">개 항목</span></span></h3>
        <p>학교 안내와 우리 아이 일정을 맞춰보세요.</p></div>
    </div>
    <ul className="school-checks__cards">{checks.map(check => {
      const Icon = ITEM_ICONS[check.kind]
      const { entryId, weekday } = check
      return <li key={check.id} className={`school-checks__card school-checks__card--${check.kind}`}>
        <div className="school-checks__card-head"><span className="school-checks__item-icon"><Icon size={20} aria-hidden="true" /></span>
          <h4>{check.kind === 'dismissal' ? '하교 시간' : check.title}</h4></div>
        <ul className="school-checks__facts">{check.facts.map((fact, index) => {
          const FactIcon = FACT_ICONS[fact.kind]
          const days = daysLabel(fact.weekdays)
          return <li key={`${fact.kind}-${index}`} className={`school-checks__fact school-checks__fact--${fact.kind}`}>
            <FactIcon size={15} aria-hidden="true" /><div><span className="school-checks__fact-label">{FACT_LABELS[fact.kind]}{days && <span> · {days}</span>}</span><strong>{fact.value}</strong></div>
          </li>
        })}</ul>
        {entryId && weekday && <button type="button" className="school-checks__action" aria-label={`${check.title} 일정에서 확인`}
          onClick={() => onInspect(entryId, weekday)}>{check.kind === 'dismissal' ? '하교 정보 보기' : '시간·참여 확인'}<ChevronRight size={16} aria-hidden="true" /></button>}
        <details className="school-checks__why"><summary>왜 확인하나요?</summary>{check.reasons.map(reason => <p key={reason}>{reason}</p>)}</details>
      </li>
    })}</ul>
    <p className="school-checks__note">시간표에 넣어도 신청·참여가 확정되지는 않아요.</p>
  </section>
}
