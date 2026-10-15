import type { PlacedBlock } from './engine'
import type { ScheduleEntry } from './types'

export const CALENDAR_START = 12 * 60
export const CALENDAR_END = 19 * 60
export const CALENDAR_HOURS = Array.from({ length: 8 }, (_, index) => 12 + index)

export type ScheduleSubject = 'school' | 'care' | 'art' | 'music' | 'dance' | 'sports' | 'coding' | 'science' | 'reading' | 'math' | 'activities' | 'personal'

export const scheduleEntrySubject = (entry: Pick<ScheduleEntry, 'kind' | 'label'>): ScheduleSubject => {
  if (entry.kind === 'school') return 'school'
  if (entry.kind === 'care') return 'care'
  const name = entry.label
  if (/미술|그림|공예|만들기|도예|아트/.test(name)) return 'art'
  if (/음악|피아노|바이올린|합창|우쿨렐레|악기|리코더/.test(name)) return 'music'
  if (/발레|무용|댄스/.test(name)) return 'dance'
  if (/체육|축구|농구|수영|태권도|줄넘기|배드민턴|스포츠/.test(name)) return 'sports'
  if (/컴퓨터|코딩|로봇|프로그래밍/.test(name)) return 'coding'
  if (/과학|실험|생명|탐구/.test(name)) return 'science'
  if (/영어|중국어|일본어|국어|독서|논술|도서관/.test(name)) return 'reading'
  if (/수학|주산|암산|숫자/.test(name)) return 'math'
  return entry.kind === 'personal' ? 'personal' : 'activities'
}

export const scheduleKindLabel = (entry: Pick<ScheduleEntry, 'kind' | 'label'>): string =>
  entry.kind === 'school' ? '정규수업' : entry.kind === 'care' ? '돌봄' : entry.kind === 'personal' ? '개인 일정'
    : entry.label === '맞춤형' || entry.label.startsWith('맞춤형 ') ? '맞춤형' : '방과후'

/** Display the type once; leave saved program names and identities untouched. */
export const scheduleEntryHeading = (entry: Pick<ScheduleEntry, 'kind' | 'label'>): string => {
  const kind = scheduleKindLabel(entry)
  let name = entry.label.trim()
  if (name === kind) name = ''
  else if (name.startsWith(`${kind} `)) name = name.slice(kind.length).trim()
  if (entry.kind === 'care' && name.endsWith(' 돌봄')) name = name.slice(0, -3).trim()
  return name ? `${kind} · ${name}` : kind
}

/** Planning connection only: care remains selected throughout the program window. */
export const careResumptions = (blocks: PlacedBlock[]): Array<{ care: PlacedBlock; after: PlacedBlock; from: number; to: number }> =>
  blocks.filter((block) => block.entry.kind === 'care').flatMap((care) => {
    const courses = blocks.filter((block) => block.entry.kind === 'afterschool' && block.start < care.end && block.end > care.start)
    const last = courses.reduce<PlacedBlock | null>((latest, course) => !latest || course.end > latest.end ? course : latest, null)
    return last && last.end < care.end ? [{ care, after: last, from: last.end, to: care.end }] : []
  })

export interface CalendarBlock {
  block: PlacedBlock
  from: number
  to: number
  lane: number
  lanes: number
}

/** Clip only the drawing; keep source times. Half-open intervals can share a lane. */
export const layoutCalendarBlocks = (blocks: PlacedBlock[], range = { start: CALENDAR_START, end: CALENDAR_END }): CalendarBlock[] => {
  const visible = blocks.map((block) => ({ block, from: Math.max(block.start, range.start), to: Math.min(block.end, range.end), lane: 0, lanes: 1 }))
    .filter(({ from, to }) => to > from)
    .sort((a, b) => a.from - b.from || b.to - a.to)
  const result: CalendarBlock[] = []
  let group: CalendarBlock[] = []
  let groupEnd = range.start
  const finishGroup = () => {
    const laneEnds: number[] = []
    for (const item of group) {
      let lane = laneEnds.findIndex((end) => end <= item.from)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = item.to
      item.lane = lane
    }
    for (const item of group) result.push({ ...item, lanes: laneEnds.length })
    group = []
  }
  for (const item of visible) {
    if (item.from >= groupEnd) finishGroup()
    group.push(item)
    groupEnd = group.length === 1 ? item.to : Math.max(item.to, groupEnd)
  }
  finishGroup()
  return result
}
