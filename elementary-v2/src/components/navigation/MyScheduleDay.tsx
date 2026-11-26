import type { CSSProperties, ReactNode } from 'react'
import { BookOpen, Circle, GraduationCap, Heart, Plus } from 'lucide-react'
import { CALENDAR_END, CALENDAR_START, layoutCalendarBlocks } from '../../utils/schedule/calendar'
import { gaps } from '../../utils/schedule/coverage'
import type { DayPlan } from '../../utils/schedule/engine'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import { GAP_MINIMUM, gapRange } from '../../utils/schedule/gapMap'
import type { CalendarRange } from '../../utils/schedule/editing'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'

const total = CALENDAR_END - CALENDAR_START
const position = (minute: number) => (Math.max(CALENDAR_START, Math.min(CALENDAR_END, minute)) - CALENDAR_START) / total * 100
const area = (from: number, to: number) => ({ top: position(from) + '%', height: position(to) - position(from) + '%' })
const icons = { afterschool: BookOpen, care: Heart, academy: GraduationCap, personal: Circle }
const names = { afterschool: '방과후', care: '돌봄', academy: '학원', personal: '개인' }

export function entryType(entry: ScheduleEntry) {
  if (entry.kind === 'afterschool' || entry.kind === 'care') return entry.kind
  return entry.activityType === 'academy' || entry.providerKey ? 'academy' : 'personal'
}

export const DAY_NAMES = ['월', '화', '수', '목', '금']

export default function MyScheduleDay({ day, compact, manual, homeAt, answered, needsCheck, care, onDismissal, onAdd, onEdit }: {
  day: DayPlan
  compact: boolean
  manual: boolean
  homeAt: number | null
  answered: boolean
  needsCheck: ReadonlySet<string>
  care?: ReactNode
  onDismissal: (day: Weekday) => void
  onAdd: (range: CalendarRange, gap?: [number, number]) => void
  onEdit: (id: string, day: Weekday) => void
}) {
  const dismissal = day.dismissal.at
  const date = DAY_NAMES[day.weekday - 1] + '요일'
  const space = gaps(day)
  const first = space.find(([from, to]) => to - from >= GAP_MINIMUM)?.[0]
  const blocks = layoutCalendarBlocks([...day.blocks, ...day.candidates].filter(({ entry }) => entry.kind !== 'school'))
  return <section className="gap-day" aria-label={date + ' 시간표'} data-testid="gap-day">
    {dismissal !== null && <div className="gap-school" style={area(CALENDAR_START, dismissal)}><span>수업</span></div>}
    {homeAt !== null && homeAt < CALENDAR_END && <div className="gap-home" style={area(homeAt, CALENDAR_END)}><span>{compact ? '집' : '보호자와 집'}</span></div>}
    {answered && homeAt !== null && <div data-testid="gap-return-line" className="gap-line gap-line--home" style={{ top: position(homeAt) + '%' }}>
      {compact ? '귀가' : '보호자 귀가'} {formatMinutes(homeAt)}
    </div>}
    {!manual && <button type="button" data-testid="gap-dismissal-line"
      className={'gap-line gap-line--school' + (dismissal === null ? ' gap-line--unknown' : '')}
      style={{ top: position(dismissal ?? CALENDAR_START) + '%' }}
      onClick={() => onDismissal(day.weekday)}
      aria-label={date + ' 하교 ' + (dismissal === null ? '확인 필요' : formatMinutes(dismissal) + (day.dismissal.evidence !== 'confirmed' ? ' 예상' : ''))}>
      {compact ? '' : '하교 '}{dismissal === null ? (compact ? '하교 ?' : '? · 확인 필요') : formatMinutes(dismissal)}{!compact && dismissal !== null && day.dismissal.evidence !== 'confirmed' ? ' · 예상' : ''}
    </button>}
    {space.map(([from, to]) => {
      const start = Math.max(CALENDAR_START, from), end = Math.min(CALENDAR_END, to)
      if (end <= start) return null
      const label = date + ' ' + formatMinutes(start) + '–' + formatMinutes(end) + ' 빈 칸에 일정 추가'
      if (end - start < GAP_MINIMUM) return <div key={from} className="gap-sliver" data-testid="gap-sliver" style={area(start, end)} title={label.replace('에 일정 추가', '')} />
      return <div key={from} className="gap-space" data-pending={!answered || undefined} style={area(start, end)}>
        <button type="button" data-testid="gap-slot" data-from={start} data-to={end} aria-label={label} onClick={(event) => {
          const rect = event.currentTarget.parentElement!.getBoundingClientRect()
          const at = event.detail && rect.height ? start + (event.clientY - rect.top) / rect.height * (end - start) : start
          onAdd(gapRange(day.weekday, start, end, at), [start, end])
        }}><Plus size={16} aria-hidden="true" />{!compact && <span>빈 {end - start}분</span>}</button>
        {!compact && from === first && end - start >= 55 && care}
      </div>
    })}
    {blocks.map(({ block: { entry, tentative }, from, to, lane, lanes }) => {
      const type = entryType(entry), Icon = icons[type], check = needsCheck.has(entry.id)
      const status = entry.participation === 'applying' ? '신청 중' : tentative ? '후보' : '확정'
      const label = date + ' ' + entry.label + ' ' + formatMinutes(from) + '–' + formatMinutes(to) + ' · ' + status + (check ? ' · 확인 필요' : '')
      return <button key={entry.id} type="button" data-testid="gap-event" className="gap-event" data-kind={type}
        data-candidate={tentative || undefined} style={{ ...area(from, to), '--lane': lane, '--lanes': lanes } as CSSProperties}
        title={label} aria-label={label} onClick={() => onEdit(entry.id, day.weekday)}>
        <span className="gap-event-name">{!compact && <Icon size={13} aria-hidden="true" />}<strong>{entry.label}</strong></span>
        {to - from >= 36 && <span className="gap-event-meta">{!compact && <>{names[type]} · </>}{status}</span>}
        {check && <b className="gap-check" aria-hidden="true">!</b>}
      </button>
    })}
  </section>
}
