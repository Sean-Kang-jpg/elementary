import { useEffect, useState, type ReactNode } from 'react'
import { getSchoolAfterschool, getSchoolDayEstimate } from '../../services/dataService'
import type { SchoolAfterschool } from '../../types'
import { funnelMeasurement } from '../../utils/analytics'
import { timetableContentChanged } from '../../utils/funnelMeasurement'
import { describeCoverage, firstGapSlot, planCoverage } from '../../utils/schedule/coverage'
import { removeEntryDay } from '../../utils/schedule/dayTimes'
import { calendarRange, type CalendarRange } from '../../utils/schedule/editing'
import { computeWeek } from '../../utils/schedule/engine'
import { afterschoolEntryFromSection, formatMinutes, schoolEntriesFromEstimate } from '../../utils/schedule/fromSchoolData'
import { applyGapEdit, type GapEdit } from '../../utils/schedule/gapEditing'
import { GAP_MINIMUM, gapRange, mapGaps } from '../../utils/schedule/gapMap'
import { effectiveEntry } from '../../utils/schedule/overrides'
import { deletePlan, readPlans, subscribePlans, upsertPlan, writePlans, type SchoolPlan } from '../../utils/schedule/plans'
import { schoolChecks } from '../../utils/schedule/schoolChecks'
import { UNSPECIFIED_SCHOOL } from '../../utils/schedule/standalone'
import { afternoonCareFor, answerReturn, answerStarterDismissal, coverageUntil, DISMISSAL_OPTIONS, emptyStarter, eveningCareFor,
  hasScheduleDismissal, RETURN_OPTIONS, starterHasSlots, starterStep, type DismissalChoice, type ReturnAt } from '../../utils/schedule/starter'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { frontyardPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import GapDialog from './GapDialog'
import GapEntrySheet from './GapEntrySheet'
import { DAY_NAMES } from './MyScheduleDay'
import MyScheduleWeek from './MyScheduleWeek'

const RETURN_ANSWERS = { 900: '15:00', 1020: '17:00', 1140: '19:00', dismissal: 'dismissal' } as const
const returnLabels = { 900: '15시', 1020: '17시', 1140: '19시', dismissal: '바로' } as const
const placeable = (entries: ScheduleEntry[]) => entries.map(effectiveEntry).filter((entry): entry is ScheduleEntry => entry !== null)

export default function MySchedule({ school, entryYear, schoolControl, onNavigate }: {
  school: { id: string; name: string }
  entryYear: number | null
  schoolControl: ReactNode
  onNavigate: (path: string) => void
}) {
  const schoolId = school.id
  const manual = schoolId === UNSPECIFIED_SCHOOL
  const [store, setStore] = useState(readPlans)
  const plan = store.plans.find(item => item.schoolId === schoolId)
  const [dayData, setDayData] = useState<Awaited<ReturnType<typeof getSchoolDayEstimate>> | null>()
  const [courseData, setCourseData] = useState<SchoolAfterschool | null>()
  const [active, setActive] = useState<Weekday>(1)
  const [week, setWeek] = useState(false)
  const [panel, setPanel] = useState<'menu' | 'return' | 'dismissal' | 'off-grid' | null>(null)
  const [dismissalDay, setDismissalDay] = useState<Weekday>(1)
  const [editing, setEditing] = useState<{ range: CalendarRange; gap?: [number, number]; entry?: ScheduleEntry } | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null)

  useEffect(() => subscribePlans(() => setStore(readPlans())), [])
  // 토스트는 5초 뒤 사라진다(C안). 되돌리기는 그 안에 누른다.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (manual) return
    let current = true
    getSchoolDayEstimate(schoolId, { allowDevFixture: false }).then(data => { if (current) setDayData(data) }).catch(() => { if (current) setDayData(null) })
    getSchoolAfterschool(schoolId, { allowDevFixture: false }).then(data => { if (current) setCourseData(data) }).catch(() => { if (current) setCourseData(null) })
    return () => { current = false }
  }, [manual, schoolId])

  const publicEntries = dayData?.day ? schoolEntriesFromEstimate(dayData.day) : []
  const withSchoolTimes = (saved: ScheduleEntry[]) => [
    ...saved, ...publicEntries.filter(entry => !saved.some(item => item.id === entry.id || item.kind === 'school' && item.weekdays.includes(entry.weekdays[0]))),
  ]
  const entries = plan?.entries ?? []
  const visible = placeable(withSchoolTimes(entries))
  const hasDismissal = hasScheduleDismissal(visible)
  const hasSlots = starterHasSlots(courseData)
  const context = { needsDismissal: !hasDismissal }
  const starter = plan?.starter
  const step = manual || (plan && !starter) ? 'done' : starterStep(starter, context)
  const home = starter?.returnAt ?? null
  const until = coverageUntil(starter)
  const days = computeWeek(visible, { from: 'dismissal', to: until ?? 0 })
  const checks = new Map(schoolChecks(visible).map(check => [check.id, check.reasons]))
  const coverage = !manual && until !== null ? planCoverage(visible, until) : null
  const care = typeof home === 'number' ? afternoonCareFor(schoolId, dayData?.care ?? null, home) : null
  const evening = typeof home === 'number' ? eveningCareFor(dayData?.care ?? null, home) : null
  const careDay = care && days.find(day => day.dismissal.at !== null && care.end !== null && care.end > day.dismissal.at && mapGaps(day).some(([from, to]) => to - from >= GAP_MINIMUM && from < care.end!))
  const offerCare = !manual && starter && starter.care === null && care && careDay && !entries.some(entry => entry.id === care.id)
  const standalone = !manual && store.plans.find(item => item.schoolId === UNSPECIFIED_SCHOOL)
  const rawGap = coverage?.state === 'gaps' && FRONTYARD_ENABLED && until !== null ? firstGapSlot(visible, until) : null
  const gapAsk = rawGap ? frontyardPath(schoolId, rawGap, { write: true }) : null
  const activePlan = days[active - 1]

  useEffect(() => {
    if (step !== 'return') return
    let current = true
    queueMicrotask(() => { if (current) funnelMeasurement.timetableStep(schoolId, { step: 'return', answer: 'start' }) })
    return () => { current = false }
  }, [schoolId, step])

  const savePlan = (change: (previous: SchoolPlan) => SchoolPlan | null, text: string, undoable = false, mergeManual = false) => {
    const current = readPlans()
    const previous = current.plans.find(item => item.schoolId === schoolId)
    const next = change(previous ?? { schoolId, schoolName: school.name, entryYear, updatedAt: '', entries: [] })
    if (!next) return false
    if (mergeManual && !manual) {
      const source = current.plans.find(item => item.schoolId === UNSPECIFIED_SCHOOL)
      if (source) next.entries = [...next.entries, ...source.entries.filter(entry => !next.entries.some(item => item.id === entry.id))]
    }
    const wasCompleted = previous?.starterCompleted === true || previous?.starter?.done === true
    const firstCompletion = next.starter?.done === true && !wasCompleted
    if (wasCompleted || firstCompletion) next.starterCompleted = true
    if (previous && !mergeManual && !timetableContentChanged(previous, next)) return true
    next.updatedAt = new Date().toISOString()
    try {
      funnelMeasurement.write(schoolId, previous ? 'edit' : 'create', () => writePlans(upsertPlan(mergeManual ? deletePlan(current, UNSPECIFIED_SCHOOL) : current, next)))
      if (firstCompletion) {
        const end = coverageUntil(next.starter)
        funnelMeasurement.timetableComplete(schoolId, {
          coverageState: end === null ? 'covered' : planCoverage(next.entries, end).state, hasDismissal, hasSlots,
        })
      }
    } catch {
      setNotice({ text: '저장하지 못했어요. 브라우저 설정을 확인해 주세요.' })
      return false
    }
    setNotice({ text, undo: undoable ? () => {
      const latest = readPlans()
      const item = latest.plans.find(value => value.schoolId === schoolId)
      if (item?.updatedAt !== next.updatedAt || !item || timetableContentChanged(item, next)) {
        setNotice({ text: '다른 곳에서 바뀐 일정은 되돌릴 수 없어요.' })
        return
      }
      try {
        writePlans(previous ? upsertPlan(latest, previous) : deletePlan(latest, schoolId))
        setNotice({ text: '되돌렸어요.' })
      } catch { setNotice({ text: '되돌리지 못했어요.' }) }
    } : undefined })
    return true
  }

  const pickReturn = (returnAt: ReturnAt) => {
    funnelMeasurement.timetableStep(schoolId, { step: 'return', answer: RETURN_ANSWERS[returnAt] })
    const saved = savePlan(previous => {
      const before = previous.starter
      const seeded = withSchoolTimes(previous.entries)
      // Preserve in-progress answers and completed history when changing the displayed pickup line.
      const answers = before?.returnAt != null && returnAt !== 'dismissal'
        ? { ...before, returnAt }
        : { ...answerReturn(returnAt, { needsDismissal: !hasScheduleDismissal(seeded) }), dismissal: before?.dismissal, ...(before?.done && { done: true }) }
      return { ...previous, starter: answers, entries: seeded }
    }, '귀가 시각을 저장했어요.', false, !plan)
    if (saved) setPanel(null)
  }
  const answerDismissal = (choice: DismissalChoice) => {
    const saved = savePlan(previous => {
      const answers = previous.starter ?? emptyStarter()
      const seeded = withSchoolTimes(previous.entries)
      const oneDay = hasScheduleDismissal(seeded)
      const response = oneDay ? { default: answers.dismissal?.default ?? 'unknown' as const, weekdays: { ...answers.dismissal?.weekdays, [dismissalDay]: choice } } : { default: choice }
      return { ...previous, ...answerStarterDismissal(schoolId, answers, seeded, response, oneDay ? dismissalDay : undefined) }
    }, '하교 시각을 저장했어요.')
    if (saved) {
      funnelMeasurement.timetableStep(schoolId, { step: 'dismissal', answer: choice === 'unknown' ? 'unknown' : formatMinutes(choice) as '12:50' | '13:40' | '14:30' })
      setPanel(null)
    }
  }
  const answerCare = (yes: boolean) => {
    const saved = savePlan(previous => {
      const answers = previous.starter
      if (!answers || typeof answers.returnAt !== 'number' || answers.care !== null) return null
      const candidate = { ...afternoonCareFor(schoolId, dayData?.care ?? null, answers.returnAt), participation: 'considering' as const }
      return { ...previous, starter: { ...answers, care: yes }, entries: yes && !previous.entries.some(entry => entry.id === candidate.id) ? [...previous.entries, candidate] : previous.entries }
    }, yes ? '돌봄 후보를 넣었어요.' : '돌봄 선택을 저장했어요.', true)
    if (saved) funnelMeasurement.timetableStep(schoolId, { step: 'care', answer: yes ? 'yes' : 'no' })
    return saved
  }
  const answerCourses = (yes: boolean) => {
    const saved = savePlan(previous => previous.starter?.care !== null && previous.starter?.courses === null
      ? { ...previous, starter: { ...previous.starter, courses: yes } } : null, '방과후 선택을 저장했어요.')
    if (saved) funnelMeasurement.timetableStep(schoolId, { step: 'courses', answer: yes ? 'yes' : hasSlots === true ? 'no' : 'skip' })
  }
  const chooseGap = (range: CalendarRange, gap?: [number, number]) => {
    setActive(range.weekday)
    setEditing({ range, gap })
  }
  const editEntry = (id: string, day: Weekday) => {
    const entry = entries.find(item => item.id === id)
    if (!entry) return
    setActive(day)
    setPanel(null)
    setEditing({ range: calendarRange(day, entry.start ?? days[day - 1].dismissal.at ?? 840), entry })
  }
  const suggestions = editing?.gap && hasSlots && courseData ? [...new Map(courseData.options.flatMap(option =>
    option.sections.filter(section => section.grade1 === 'true' || section.school_wide || option.grade1 === 'true')
      .map(section => afterschoolEntryFromSection(schoolId, courseData.source_year, option, section, 'planned')))
    .filter((entry): entry is ScheduleEntry => Boolean(entry && entry.weekdays.includes(editing.range.weekday) && entry.start !== null && entry.end !== null
      && entry.start >= editing.gap![0] && entry.end <= editing.gap![1] && !entries.some(item => item.id === entry.id && (item.weekdays.includes(editing.range.weekday) || item.userOverride?.deleted))))
    .map(entry => [entry.id, entry])).values()] : []
  const saveCourse = (course: ScheduleEntry) => {
    if (!editing) return false
    const day = editing.range.weekday
    const saved = savePlan(previous => {
      const prior = previous.entries.find(entry => entry.id === course.id)
      if (prior?.weekdays.includes(day) || prior?.userOverride?.deleted) return null
      const selected = prior
        ? { ...prior, weekdays: [...prior.weekdays, day].sort() as Weekday[] }
        : { ...course, weekdays: [day], offeredWeekdays: course.weekdays }
      const answers = previous.starter
      return { ...previous, entries: [...withSchoolTimes(previous.entries).filter(entry => entry.id !== selected.id), selected],
        starter: answers && answers.care !== null && answers.courses === null ? { ...answers, courses: true } : answers }
    }, '학교 강좌를 넣었어요.', true)
    if (saved && starter?.care !== null && starter?.courses === null) funnelMeasurement.timetableStep(schoolId, { step: 'courses', answer: 'yes' })
    return saved
  }
  const saveEntry = (edit: GapEdit) => savePlan(previous => {
    const next = applyGapEdit(withSchoolTimes(previous.entries), edit, crypto.randomUUID())
    return next ? { ...previous, entries: next } : null
  }, edit.original ? '일정을 수정했어요.' : '일정을 넣었어요.', true)
  const remove = (all: boolean) => editing?.entry && savePlan(previous => {
    const original = editing.entry!
    const latest = previous.entries.find(entry => entry.id === original.id)
    if (!latest || JSON.stringify(latest) !== JSON.stringify(original)) return null
    const removeAll = all || original.weekdays.length === 1
    const next = removeAll && original.source
      ? previous.entries.map(entry => entry.id === original.id ? { ...entry, userOverride: { ...entry.userOverride, deleted: true } } : entry)
      : all ? previous.entries.filter(entry => entry.id !== original.id) : removeEntryDay(previous.entries, original.id, editing.range.weekday)
    return { ...previous, entries: next }
  }, '일정을 뺐어요.', true) || false

  const returnOptions = <div className="gap-choices">{[...RETURN_OPTIONS].reverse().map(({ value }) => <button type="button" key={value}
    disabled={dayData === undefined && !hasDismissal} aria-pressed={home === value} data-testid={'gap-return-' + value} onClick={() => pickReturn(value)}>{returnLabels[value]}</button>)}</div>
  const closePanel = () => setPanel(null)
  const free = mapGaps(activePlan).find(([from, to]) => to - from >= GAP_MINIMUM)
  return <>
    <MyScheduleWeek days={days} active={active} setActive={setActive} week={week} setWeek={setWeek} manual={manual} returnAt={home}
      school={schoolControl} needsCheck={new Set(checks.keys())} onMenu={() => { setNotice(null); setPanel('menu') }}
      onAddAny={() => free ? chooseGap(gapRange(active, free[0], free[1], free[0]), free) : chooseGap(calendarRange(active, 840))}
      care={offerCare && careDay ? { weekday: careDay.weekday, content: <div className="gap-care" data-testid="gap-care-offer">
        <button type="button" onClick={() => answerCare(true)}>＋ 학교 돌봄으로 채우기</button><button type="button" aria-label="학교 돌봄 없이 계속" onClick={() => answerCare(false)}>괜찮아요</button>
      </div> } : undefined}
      onDismissal={day => { setDismissalDay(day); setPanel('dismissal') }} onAdd={chooseGap} onEdit={editEntry}
      question={!manual && home === null && <div className="gap-question" data-testid="gap-return-question"><strong>보호자가 몇 시에 집에 오나요?</strong>{returnOptions}</div>} />
    {notice && <div className="gap-toast" data-testid="gap-toast"><span role="status">{notice.text}</span>{notice.undo && <button type="button" onClick={notice.undo}>되돌리기</button>}
      <button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}>×</button></div>}
    {panel === 'menu' && <GapDialog title="시간표 안내" onClose={closePanel}>
      <div className="gap-menu-list">
        <p>이 브라우저에 초안을 저장해요. 예상·후보 일정은 학교 일정과 참여 여부를 확인해 주세요.</p>
        {!manual && <button type="button" onClick={() => setPanel('return')}>보호자 귀가 시각 바꾸기</button>}
        <button type="button" onClick={() => setPanel('off-grid')}>격자 밖 · 숨긴 일정</button>
        {coverage && <p data-testid="plan-coverage" data-coverage={coverage.state}>{describeCoverage(coverage)}</p>}
        {gapAsk && <a href={gapAsk} data-testid="plan-gap-ask" onClick={event => followLink(event, gapAsk, onNavigate)}>원하는 활동 알리기</a>}
        {step === 'care' && <>
          {offerCare && <button type="button" onClick={() => { if (answerCare(true)) closePanel() }}>학교 돌봄 후보 넣기</button>}
          <button type="button" onClick={() => answerCare(false)}>학교 돌봄 없이 계속</button>
        </>}
        {step === 'courses' && <>
          {entries.some(entry => entry.kind === 'afterschool' && !entry.userOverride?.deleted) && <button type="button" onClick={() => answerCourses(true)}>방과후 선택 완료</button>}
          <button type="button" onClick={() => answerCourses(false)}>{hasSlots ? '방과후 없이 계속' : '학교 강좌 시간 자료 건너뛰기'}</button>
        </>}
        {step === 'fill' && evening && !entries.some(entry => entry.id === evening.id) && <button type="button" onClick={() => {
          if (savePlan(previous => previous.entries.some(entry => entry.id === evening.id) ? null : { ...previous, entries: [...previous.entries, evening] }, '저녁 돌봄을 넣었어요.', true)) closePanel()
        }}>저녁 돌봄 넣기 · 학교 공시</button>}
        {step === 'fill' && <button type="button" data-testid="gap-complete" onClick={() => {
          funnelMeasurement.timetableStep(schoolId, { step: 'fill', answer: 'yes' })
          if (savePlan(previous => previous.starter && starterStep(previous.starter, context) === 'fill'
            ? { ...previous, starter: { ...previous.starter, done: true } } : null, '시간표 초안 완료 ✓')) closePanel()
        }}>다 됐어요</button>}
        {starter?.done && <p data-testid="starter-complete">시간표 초안 완료 ✓</p>}
        {standalone && plan && <button type="button" onClick={() => {
          if (savePlan(previous => ({ ...previous }), '직접 입력한 일정을 가져왔어요.', false, true)) closePanel()
        }}>직접 입력한 일정 가져오기</button>}
      </div>
    </GapDialog>}
    {panel === 'return' && <GapDialog title="보호자 귀가 시각" onClose={closePanel}>{returnOptions}</GapDialog>}
    {panel === 'dismissal' && <GapDialog title={DAY_NAMES[dismissalDay - 1] + '요일 하교'} onClose={closePanel}>
      {days[dismissalDay - 1].dismissal.at === null
        ? <div className="gap-menu-list"><p>학교 하교 시각을 확인해 주세요. 잘 모르면 13:40으로 가정해요.</p>{DISMISSAL_OPTIONS.map(choice => <button type="button" key={choice} onClick={() => answerDismissal(choice)}>{choice === 'unknown' ? '잘 몰라요' : formatMinutes(choice)}</button>)}</div>
        : <div className="gap-menu-list"><p>{formatMinutes(days[dismissalDay - 1].dismissal.at!)} · 실제 시간은 학교에 확인해 주세요.</p></div>}
    </GapDialog>}
    {panel === 'off-grid' && <GapDialog title="격자 밖 · 숨긴 일정" onClose={closePanel}><div className="gap-menu-list">
      {entries.filter(entry => entry.kind !== 'school' && !entry.userOverride?.deleted).map(entry => <button type="button" key={entry.id}
        onClick={() => editEntry(entry.id, entry.weekdays.includes(active) ? active : entry.weekdays[0])}>{entry.label}</button>)}
    </div></GapDialog>}
    {editing && <GapEntrySheet range={editing.range} gap={editing.gap} entry={editing.entry} suggestions={suggestions} reasons={checks.get(editing.entry?.id ?? '') ?? []}
      onClose={() => setEditing(null)} onSave={saveEntry} onCourse={saveCourse} onRemove={remove} />}
  </>
}
