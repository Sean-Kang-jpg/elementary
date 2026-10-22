import { useLayoutEffect, useRef, useState } from 'react'
import { computeWeek, WEEKDAYS, type DayPlan } from '../../utils/schedule/engine'
import { CALENDAR_END, CALENDAR_HOURS, CALENDAR_START, careResumptions, layoutCalendarBlocks, scheduleEntryHeading, scheduleKindLabel } from '../../utils/schedule/calendar'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import type { ParticipationStatus, ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { calendarRange, canEditCalendarEntry, GRID_STEP, type CalendarChange, type CalendarRange } from '../../utils/schedule/editing'
import CalendarEntryDialog from './CalendarEntryDialog'
import useCalendarInteraction from './useCalendarInteraction'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'
import MorningCalendarBand from './MorningCalendarBand'
import { isMorningCalendarCare, morningCalendarView } from '../../utils/schedule/morningCalendar'
import MyScheduleDay from './MyScheduleDay'
import ScheduleAddCard from './ScheduleAddCard'
import { withCarePlanningDefaults } from '../../utils/schedule/carePlanning'
import { followLink } from '../content/contentLinks'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { frontyardPath } from '../../utils/urlState'

const DAYS = ['월', '화', '수', '목', '금']
const STATUS: Record<ParticipationStatus, string> = { considering: '후보', planned: '계획에 포함', applying: '신청 중', confirmed: '참여 확정', rejected: '미선정', cancelled: '취소' }
const percent = (minutes: number) => (minutes - CALENDAR_START) / (CALENDAR_END - CALENDAR_START) * 100
const timing = (entry: ScheduleEntry, day: DayPlan) => {
  entry = withCarePlanningDefaults(entry)
  if (entry.kind === 'school') return `하교 ${day.dismissal.at === null ? '미확인' : `${formatMinutes(day.dismissal.at)} (예상)`}`
  const start = entry.startsAfterSchool ? day.dismissal.at : entry.start
  return `${entry.startsAfterSchool ? start === null ? '하교 후 (시각 미확인)' : `${formatMinutes(start)} (하교 후)` : start === null ? '시작 미확인' : formatMinutes(start)} ~ ${entry.end === null ? '종료 미확인' : formatMinutes(entry.end)}`
}
const compactTime = (entry: ScheduleEntry, day: DayPlan) => {
  entry = withCarePlanningDefaults(entry)
  if (entry.kind === 'school') return `하교 ${day.dismissal.at === null ? '미확인' : formatMinutes(day.dismissal.at)}`
  const start = entry.startsAfterSchool ? day.dismissal.at : entry.start
  return `${start === null ? entry.startsAfterSchool ? '하교 후' : '시작 미확인' : formatMinutes(start)}–${entry.end === null ? '종료 미확인' : formatMinutes(entry.end)}${entry.timeAssumption ? ' · 기본 가정' : ''}`
}

export default function MyScheduleWeek({ schoolId, entries, onSave, onAdd, onRemove, onToggleDay, onNavigate }: {
  schoolId: string; entries: ScheduleEntry[]; onSave: (change: CalendarChange) => ScheduleEntry | null
  onNavigate?: (path: string) => void
  onAdd: (entry: ScheduleEntry) => boolean; onRemove: (id: string) => boolean
  onToggleDay: (entry: ScheduleEntry, weekday: Weekday) => boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [activeDay, setActiveDay] = useState<Weekday>(1)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selected, setSelected] = useState<{ id: string; weekday: Weekday } | null>(null)
  const [editor, setEditor] = useState<CalendarChange | null>(null)
  const [adding, setAdding] = useState<CalendarRange | null>(null)
  const [cursor, setCursor] = useState<CalendarRange | null>(null)
  const [notice, setNotice] = useState('')
  useLayoutEffect(() => {
    const node = scroller.current
    const active = node?.querySelector<HTMLElement>('.my-week__day--active')
    const first = node?.firstElementChild as HTMLElement | null
    if (node && active && first) node.scrollLeft = active.offsetLeft - first.offsetLeft
  }, [view])
  const days = computeWeek(entries, { from: 'dismissal', to: CALENDAR_END })
  const morning = morningCalendarView(entries)
  const selectedEntry = entries.find((entry) => entry.id === selected?.id && !['cancelled', 'rejected'].includes(entry.participation))
  const selectedDay = days.find((day) => day.weekday === selected?.weekday)
  const jumpTo = (weekday: Weekday) => {
    setActiveDay(weekday)
    const node = scroller.current
    if (!node) return
    const day = node.children[weekday - 1] as HTMLElement
    const first = node.children[0] as HTMLElement
    node.scrollTo({ left: day.offsetLeft - first.offsetLeft, behavior: 'auto' })
  }
  const createAt = (range: CalendarRange) => { setAdding(range); setCursor(null); setNotice('') }
  const editAt = (entry: ScheduleEntry, weekday: Weekday) => {
    if (!canEditCalendarEntry(entry) || entry.kind === 'school') return
    const start = entry.start ?? days.find((day) => day.weekday === weekday)?.dismissal.at ?? 14 * 60
    setEditor({ original: entry, fromWeekday: weekday, weekday, start, end: entry.end !== null && entry.end > start ? entry.end : start + 60, label: entry.label, kind: entry.kind })
  }
  const save = (change: CalendarChange) => {
    const saved = onSave(change)
    if (saved) {
      setSelected({ id: saved.id, weekday: change.weekday })
      jumpTo(change.weekday)
      setNotice(change.original ? '선택한 요일의 일정을 수정했어요.' : '일정을 추가했어요.')
    } else setNotice('저장하지 못했어요. 변경된 일정은 다시 열어 주세요.')
    return saved
  }
  const interaction = useCalendarInteraction({ scroller, onCreate: createAt, onMove: (original, fromWeekday, range) => {
    if (original.kind === 'school') return
    save({ ...range, original, fromWeekday, label: original.label, kind: original.kind })
  } })
  const preview = interaction.preview ?? cursor
  const composer = adding ? <ScheduleAddCard key={adding.weekday} schoolId={schoolId} entries={entries} range={adding} onNavigate={onNavigate} onAdd={onAdd} onRemove={onRemove} onToggleDay={onToggleDay} onSave={save}
    onChangeDay={(weekday) => { setSelected(null); jumpTo(weekday); setAdding({ ...adding, weekday }) }} onClose={() => setAdding(null)} /> : undefined
  return <div className={`my-week-section my-week-section--${view}`} onKeyDown={(event) => {
    if (event.key === 'Escape' && (interaction.onEscape() || cursor)) { setCursor(null); event.preventDefault(); event.stopPropagation() }
  }}>
    <div className="my-calendar-toolbar"><div><span className="my-calendar-eyebrow">{view === 'day' ? '매주 반복되는 우리 아이의 하루' : `${morning ? '아침 · 정규수업 축약 · 오후' : '12:00~19:00'} · 5분 단위`}</span><h3>{view === 'day' ? `${DAYS[activeDay - 1]}요일 시간표` : '주간 시간표 편집'}</h3></div><button type="button" className="my-button my-calendar-add" onClick={() => createAt(calendarRange(activeDay, 14 * 60))}>+ 일정 추가</button></div>
    <div className="my-calendar-view" role="group" aria-label="시간표 보기 방식">
      <button type="button" aria-pressed={view === 'day'} onClick={() => { interaction.onEscape(); setCursor(null); setView('day') }}>하루 보기</button>
      <button type="button" aria-pressed={view === 'week'} onClick={() => { setCursor(null); setView('week') }}>주간 편집</button>
    </div>
    {view === 'week' && <>
    <p className="my-help my-calendar-instructions" id="my-calendar-instructions">오후 빈칸을 누르거나 드래그해 일정을 추가하세요. 직접 입력한 오후 일정은 끌어서 옮길 수 있어요.</p>
    {morning && <p className="my-help my-calendar-instructions">아침돌봄부터 시간순으로 보여요. 가운데 정규수업 구간은 축약했으며 시간 간격이 같지 않아요. 등교시각·이동 조건은 별도 확인이 필요해요.</p>}
    <p className="my-help my-week-hint">요일은 옆으로 넘겨 볼 수 있어요. 모바일에서는 빈칸을 누른 뒤 시간과 요일을 조정할 수 있어요.</p>
    </>}
    <div className="my-week-nav" role="group" aria-label="시간표 요일 이동">
      {WEEKDAYS.map((weekday) => <button type="button" key={weekday} aria-label={`${DAYS[weekday - 1]}요일`} aria-pressed={activeDay === weekday} aria-controls={view === 'day' ? `my-agenda-day-${activeDay}` : `my-week-day-${weekday}`} onClick={() => { setSelected(null); setAdding(null); jumpTo(weekday) }}><span>{view === 'day' ? ['MON', 'TUE', 'WED', 'THU', 'FRI'][weekday - 1] : DAYS[weekday - 1]}</span>{view === 'day' && <><b>{DAYS[weekday - 1]}요일</b><i aria-hidden="true" /></>}</button>)}
    </div>
    {view === 'day' ? <MyScheduleDay day={days[activeDay - 1]} entries={entries} selectedId={selected?.weekday === activeDay ? selected.id : undefined} onSelect={(id) => setSelected({ id, weekday: activeDay })} onCreate={() => createAt(calendarRange(activeDay, 14 * 60))} composer={composer} /> : <>
    <div className="my-calendar" data-testid={morning ? 'morning-care-week' : undefined} aria-label={morning ? '아침돌봄부터 저녁 7시까지, 정규수업 구간 축약 시간표' : '오후 12시부터 저녁 7시까지 시간표'}>
      <div className="my-calendar__axis" aria-hidden="true">
        {morning && <>
          {morning.hasUnknown && <div className="my-morning__axis-unknown">등교 전</div>}
          {morning.height > 0 && <div className="my-morning__axis" style={{ height: morning.height }}>{morning.hours.map((hour) => <span key={hour} style={{ top: (hour * 60 - morning.start!) * 1.2 }}>{String(hour).padStart(2, '0')}:00</span>)}</div>}
          <div className="my-school-fold__axis"><span>수업</span><span>축약</span><span>⋮</span></div>
        </>}
        <div className="my-calendar__hours">
        {CALENDAR_HOURS.map((hour) => <span key={hour} style={{ top: `${percent(hour * 60)}%` }}>{hour}:00</span>)}
      </div></div>
      <div className="my-week" ref={scroller} role="region" aria-label="요일별 시간표" tabIndex={0} onScroll={() => {
        const node = scroller.current
        if (!node || node.scrollWidth <= node.clientWidth) return
        if (node.scrollLeft >= node.scrollWidth - node.clientWidth - 2) { setActiveDay(5); return }
        const left = node.getBoundingClientRect().left
        const closest = [...node.children].reduce((a, b) => Math.abs(a.getBoundingClientRect().left - left) < Math.abs(b.getBoundingClientRect().left - left) ? a : b)
        setActiveDay(Number(closest.getAttribute('data-weekday')) as Weekday)
      }}>
        {days.map((day) => {
          const visible = entries.filter((entry) => entry.weekdays.includes(day.weekday) && !['cancelled', 'rejected'].includes(entry.participation))
          const placed = [...day.blocks, ...day.candidates]
          const calendar = layoutCalendarBlocks(morning ? placed.filter(({ entry }) => entry.kind !== 'school') : placed)
          const drawn = new Set(calendar.map(({ block }) => block.entry.id))
          if (morning) {
            visible.filter((entry) => entry.kind === 'school' || isMorningCalendarCare(entry)).forEach((entry) => drawn.add(entry.id))
            placed.filter((block) => block.entry.kind !== 'school' && morning.start !== null && morning.end !== null && block.start < morning.end && block.end > morning.start).forEach((block) => drawn.add(block.entry.id))
          }
          const endOnly = visible.map(withCarePlanningDefaults).filter((entry) => !drawn.has(entry.id) && entry.kind === 'care' && entry.startsAfterSchool && entry.end !== null && entry.end >= CALENDAR_START && entry.end <= CALENDAR_END)
          endOnly.forEach((entry) => drawn.add(entry.id))
          const undrawn = visible.filter((entry) => !drawn.has(entry.id))
          const conflicts = day.overlaps.filter((overlap) => overlap.type === 'conflict')
          const careOverlap = day.overlaps.filter((overlap) => overlap.type === 'care_afterschool')
          const resumptions = day.unplaced.some(({ entry }) => entry.kind === 'afterschool') ? [] : careResumptions(day.blocks)
          return <div className={`my-week__day${activeDay === day.weekday ? ' my-week__day--active' : ''}`} id={`my-week-day-${day.weekday}`} data-weekday={day.weekday} key={day.weekday}>
            <h4>{DAYS[day.weekday - 1]}요일</h4>
            {morning && <MorningCalendarBand view={morning} day={day} entries={visible} onSelect={(id) => setSelected({ id, weekday: day.weekday })} />}
            <div className="my-week__timeline" role="group" aria-label={`${DAYS[day.weekday - 1]}요일 일정 추가. 위아래 화살표로 5분 이동하고 Enter로 추가하세요.`} aria-describedby="my-calendar-instructions" tabIndex={0}
              onPointerDown={(event) => interaction.beginCreate(event, day.weekday)} onPointerMove={interaction.onPointerMove} onPointerUp={interaction.onPointerUp} onPointerCancel={interaction.onPointerCancel} onLostPointerCapture={interaction.onLostPointerCapture}
              onFocus={(event) => { if (event.target === event.currentTarget && !interaction.isPointerActive()) setCursor(calendarRange(day.weekday, 14 * 60)) }}
              onBlur={(event) => { if (event.target === event.currentTarget) setCursor(null) }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  setCursor(calendarRange(day.weekday, (cursor?.weekday === day.weekday ? cursor.start : 14 * 60) + (event.key === 'ArrowUp' ? -GRID_STEP : GRID_STEP)))
                } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); createAt(cursor?.weekday === day.weekday ? cursor : calendarRange(day.weekday, 14 * 60)) }
              }}>
              {CALENDAR_HOURS.map((hour) => <div className="my-week__hour-line" key={hour} style={{ top: `${percent(hour * 60)}%` }} aria-hidden="true" />)}
              {morning && day.dismissal.at !== null && day.dismissal.at > CALENDAR_START && <div className="my-school-continuation" style={{ height: `${Math.min(100, percent(day.dismissal.at))}%` }}><span>정규수업 중</span></div>}
              {calendar.map(({ block, from, to, lane, lanes }) => {
                const entry = block.entry
                const time = timing(entry, day)
                const label = `${DAYS[day.weekday - 1]}요일 ${scheduleEntryHeading(entry)} · ${time} · ${entry.kind === 'school' ? '자료 기반 예상' : STATUS[entry.participation]}`
                const movable = canEditCalendarEntry(entry) && block.end - block.start <= CALENDAR_END - CALENDAR_START
                return <button key={entry.id} type="button" className={`my-week__entry my-week__entry--${entry.kind}${scheduleKindLabel(entry) === '맞춤형' ? ' my-week__entry--custom' : ''}${entry.participation === 'considering' ? ' my-week__candidate' : ''}${movable ? ' my-week__entry--editable' : ''}${interaction.movingId === entry.id ? ' my-week__entry--moving' : ''}`}
                  style={{ top: `${percent(from)}%`, height: `${(to - from) / (CALENDAR_END - CALENDAR_START) * 100}%`, left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                  data-start={block.start} data-end={block.end} data-lane={lane} data-lanes={lanes} aria-label={label} title={label}
                  aria-pressed={selected?.id === entry.id && selected.weekday === day.weekday}
                  onPointerDown={(event) => { event.stopPropagation(); if (movable) interaction.beginMove(event, entry, day.weekday, block.start, block.end) }}
                  onPointerMove={interaction.onPointerMove} onPointerUp={interaction.onPointerUp} onPointerCancel={interaction.onPointerCancel} onLostPointerCapture={interaction.onLostPointerCapture}
                  onClick={() => { if (interaction.suppressClick.current) return; setSelected({ id: entry.id, weekday: day.weekday }) }}>
                  <b><ScheduleSubjectIcon entry={entry} /><span className="my-entry-title">{scheduleEntryHeading(entry)}</span></b><span className="my-week__time">{compactTime(entry, day)}</span>
                </button>
              })}
              {endOnly.map((entry) => <button key={entry.id} type="button" className="my-week__entry my-week__entry--care" style={{ top: `${percent(entry.end!)}%`, height: 'auto', minHeight: 36, left: 3, right: 3 }}
                aria-label={`${entry.label} ${formatMinutes(entry.end!)} 종료${entry.timeAssumption ? ' · 기본 가정' : ''} · 시작 확인 필요`} onClick={() => setSelected({ id: entry.id, weekday: day.weekday })}>
                <b>{entry.label} · {formatMinutes(entry.end!)} 종료</b><span>시작 확인 필요{entry.timeAssumption && ' · 기본 가정'}</span>
              </button>)}
              {!visible.length && <span className="my-week__empty">일정 없음</span>}
              {preview?.weekday === day.weekday && <div className="my-calendar-draft" style={{ top: `${percent(preview.start)}%`, height: `${(preview.end - preview.start) / (CALENDAR_END - CALENDAR_START) * 100}%` }}>
                <b>{interaction.movingId ? '일정 이동' : '새 일정'}</b><span>{formatMinutes(preview.start)}–{formatMinutes(preview.end)}</span>
              </div>}
            </div>
            <div className="my-week__notes">
              {undrawn.map((entry) => <div className="my-week__unplaced" key={entry.id}><b>{entry.label}</b><small>{timing(entry, day)}</small><small>{placed.some((block) => block.entry.id === entry.id) ? '12:00~19:00 표시 범위 밖' : '시간 확인 필요'} · {entry.kind === 'school' ? '자료 미확인' : STATUS[entry.participation]}</small>{canEditCalendarEntry(entry) && <button className="my-button" type="button" onClick={() => editAt(entry, day.weekday)}>요일·시간 수정</button>}</div>)}
              {conflicts.length > 0 && <small className="my-warning">시간 겹침 {conflicts.length}건 · 반의 시간을 확인하세요.</small>}
              {careOverlap.length > 0 && <div className="my-care-connection">
                <small>돌봄 + 방과후/맞춤형 함께 계획</small>
                {resumptions.map(({ care, after, from, to }) => <small key={care.entry.id}>{after.entry.label} 종료 → {care.entry.label} {formatMinutes(from)}–{formatMinutes(to)}</small>)}
                <small>이동·복귀 조건은 학교에 확인해 주세요.</small>
              </div>}
            </div>
          </div>
        })}
      </div>
    </div>
    {composer}
    </>}
    {selectedEntry && selectedDay && <div className="my-week-detail" role="status">
      <div className="my-course-picker__heading"><b>{DAYS[selectedDay.weekday - 1]}요일 · {selectedEntry.label}</b><button type="button" className="my-button" onClick={() => setSelected(null)}>닫기</button></div>
      <p>{scheduleKindLabel(selectedEntry)} · {timing(selectedEntry, selectedDay)} · {selectedEntry.kind === 'school' ? '자료 기반 예상' : STATUS[selectedEntry.participation]}</p>
      {withCarePlanningDefaults(selectedEntry).timeAssumption && <p className="my-help">{withCarePlanningDefaults(selectedEntry).timeAssumption} · 실제 운영시간은 학교 확인이 필요해요.</p>}
      {selectedEntry.source && <small>학년도/확인 기준 {selectedEntry.source.version}</small>}
      {canEditCalendarEntry(selectedEntry) && <button type="button" className="my-button" onClick={() => editAt(selectedEntry, selectedDay.weekday)}>요일·시간 수정</button>}
      {onNavigate && FRONTYARD_ENABLED && <AlternativesLink schoolId={schoolId} entry={selectedEntry} day={selectedDay} onNavigate={onNavigate} />}
    </div>}
    <p className="my-calendar-feedback" aria-live="polite">{notice}</p>
    {editor && <CalendarEntryDialog draft={editor} onSave={save} onClose={() => setEditor(null)} />}
    {view === 'week' && <p className="my-help my-calendar-help">{morning ? '아침돌봄은 선택한 요일에만 표시해요. 정규수업은 위에서 축약하고 오후에는 예상 하교까지 수업 중으로 표시해요. 19시 이후 일정은 표시 범위를 넘어 이어질 수 있어요.' : '시간이 확인된 일정만 시간축에 배치해요. 정규수업은 예상 하교 시각까지 표시하며, 12시 이전·19시 이후 일정은 표시 범위를 넘어 이어질 수 있어요.'}</p>}
  </div>
}

/**
 * 기존 일정 자리에서 다른 프로그램을 찾는다("화요일 15시 학원 대신", 인수인계서 5.3). 그 요일·시간으로 학교앞마당을
 * 열 뿐, 이 일정은 지우거나 바꾸지 않는다. 정규수업이나 시각을 모르는 일정에는 두지 않는다.
 */
function AlternativesLink({ schoolId, entry, day, onNavigate }: { schoolId: string; entry: ScheduleEntry; day: DayPlan; onNavigate: (path: string) => void }) {
  if (entry.kind === 'school') return null
  const start = entry.startsAfterSchool ? day.dismissal.at : entry.start
  if (start === null || entry.end === null || start >= entry.end) return null
  const path = frontyardPath(schoolId, { weekday: day.weekday, start: formatMinutes(start), end: formatMinutes(entry.end) })
  return <a className="my-button" href={path} onClick={(event) => followLink(event, path, onNavigate)}>이 시간에 다른 프로그램 알아보기</a>
}
