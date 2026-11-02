// 우리집 일정의 순수 규칙. 저장·이벤트는 familyPlan.ts가 맡고, 이 파일은 JSON 콘텐츠를 읽지 않아
// node --test로 바로 시험한다(UX_BACKLOG_PLAN_CENTERED.md UX-K0).

/** 일정을 시작한 곳. plan_start·plan_item_add의 `from`과 같다(CODEX_UX_HANDOFF.md C-01). */
export type PlanSource = 'home' | 'guide' | 'home_worry' | 'school_detail' | 'apartment_detail' | 'result_page' | 'timetable' | 'my'

/** 우리집 일정의 두 면. */
export type PlanFace = 'timeline' | 'week'

/** 언제 할 일인가. 날짜를 아는 것(발송일·마감일), 달만 아는 것(로드맵), 시기 없는 것(입학 1~2년 전). */
export type TimelineWhen =
  | { kind: 'date'; date: string } // 'YYYY-MM-DD'
  | { kind: 'month'; month: number } // 1~12
  | { kind: 'anytime' }

/** 사용자가 홈·가이드에서 직접 담은 항목. 로드맵 항목은 저장하지 않고 그때그때 만든다. */
export interface PinnedItem {
  id: string
  title: string
  href: string
  when: TimelineWhen
  addedAt: string
}

export interface TimelineEntry {
  id: string
  title: string
  href?: string
  when: TimelineWhen
  done: boolean
  source: 'roadmap' | 'pinned'
}

export interface RoadmapTaskLike {
  id: string
  text: string
  link?: string
  /** 'MM-DD'. 시행령으로 정해진 날짜가 있는 할 일만(통학구역 확정·취학통지·연기 신청 마감). */
  due?: string
}

/** roadmapFor()의 결과 중 일정이 쓰는 부분. roadmap.ts를 가져오지 않으려고 모양만 받는다. */
export interface RoadmapViewLike {
  stage: 'planning' | 'admission'
  month: number
  now: RoadmapTaskLike[]
  upcoming: Array<{ month: number; tasks: RoadmapTaskLike[] }>
}

const DAY = 86_400_000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** 'MM-DD'를 오늘 이후 가장 가까운 날로. 오늘이 그날이면 오늘. 홈 선반의 deadline을 일정 날짜로 바꿀 때 쓴다. */
export const nextDateOf = (mmdd: string, now = new Date()): string | null => {
  const match = /^(\d{2})-(\d{2})$/.exec(mmdd)
  if (!match) return null
  const today = startOfDay(now)
  let year = today.getFullYear()
  let target = new Date(year, Number(match[1]) - 1, Number(match[2]))
  if (target < today) target = new Date(++year, Number(match[1]) - 1, Number(match[2]))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}

/**
 * 정렬 열쇠: 오늘부터 며칠 뒤인가. 달 항목은 그 달 1일 바로 앞(-0.5)에 둬서 같은 달의 날짜 항목보다 먼저 온다.
 * 이번 달은 이미 지난 1일 기준이라 음수다. 지난 날짜도 음수라 앞에 온다 — 놓친 일을 먼저 보여 주려는 것.
 * 달은 지금부터 열두 달 안의 그 달로 읽는다(로드맵은 9월~이듬해 3월). 시기 없는 항목은 맨 뒤.
 */
const sortKey = (when: TimelineWhen, now: Date): number => {
  const today = startOfDay(now)
  if (when.kind === 'anytime') return Number.MAX_SAFE_INTEGER
  if (when.kind === 'month') {
    const current = today.getMonth() + 1
    const first = new Date(today.getFullYear() + (when.month < current ? 1 : 0), when.month - 1, 1)
    return Math.round((first.getTime() - today.getTime()) / DAY) - 0.5
  }
  const date = parseDate(when.date)
  return date ? Math.round((date.getTime() - today.getTime()) / DAY) : Number.MAX_SAFE_INTEGER
}

/**
 * 로드맵(프로필로 거른 것)과 담은 항목을 하나의 일정으로. 같은 id는 로드맵 쪽을 쓴다.
 * 완료는 기존 체크리스트 저장값(`wherecho:checklist-v1`)을 그대로 쓴다 — 일정과 체크리스트는 같은 할 일이다.
 */
export const mergeTimeline = (
  roadmap: RoadmapViewLike | null,
  pinned: PinnedItem[],
  checked: Record<string, boolean>,
  now = new Date(),
): TimelineEntry[] => {
  const entries: TimelineEntry[] = []
  const seen = new Set<string>()
  const push = (entry: Omit<TimelineEntry, 'done'>) => {
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    entries.push({ ...entry, done: checked[entry.id] === true })
  }
  if (roadmap) {
    // 날짜가 있는 할 일은 그 달이 속한 해로 읽는다. 이번 달 것은 올해라, 지난 날짜는 다음 해로 넘어가지 않고 놓친 일로 남는다.
    const whenOf = (task: RoadmapTaskLike, month: number): TimelineWhen => {
      if (task.due && /^\d{2}-\d{2}$/.test(task.due)) {
        return { kind: 'date', date: `${now.getFullYear() + (month < roadmap.month ? 1 : 0)}-${task.due}` }
      }
      return roadmap.stage === 'planning' ? { kind: 'anytime' } : { kind: 'month', month }
    }
    for (const task of roadmap.now) push({ id: task.id, title: task.text, href: task.link, when: whenOf(task, roadmap.month), source: 'roadmap' })
    for (const group of roadmap.upcoming) {
      for (const task of group.tasks) push({ id: task.id, title: task.text, href: task.link, when: whenOf(task, group.month), source: 'roadmap' })
    }
  }
  for (const item of pinned) push({ id: item.id, title: item.title, href: item.href, when: item.when, source: 'pinned' })
  return entries
    .map((entry, index) => ({ entry, index, key: sortKey(entry.when, now) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ entry }) => entry)
}

/** 날짜 항목까지 남은 날. 오늘이면 0, 지났으면 음수. 날짜가 없는 항목은 null. */
export const daysUntil = (when: TimelineWhen, now = new Date()): number | null => {
  if (when.kind !== 'date') return null
  const date = parseDate(when.date)
  return date ? Math.round((date.getTime() - startOfDay(now).getTime()) / DAY) : null
}

/** 날짜 항목의 표시: D-12(2주 안이면 soon), 오늘, 지남. 날짜를 모르는 항목은 null. 입학까지 면과 홈 카드가 같이 쓴다. */
export const dueBadge = (when: TimelineWhen, now = new Date()): { text: string; tone: 'soon' | 'later' | 'missed' } | null => {
  const days = daysUntil(when, now)
  if (days === null) return null
  if (days < 0) return { text: '지남', tone: 'missed' }
  return { text: days === 0 ? '오늘' : `D-${days}`, tone: days <= 14 ? 'soon' : 'later' }
}

export interface TimelineGroup {
  /** 이 달(놓친 일 포함), 뒤의 달, 또는 null = 시기 없음. */
  month: number | null
  entries: TimelineEntry[]
}

/**
 * 정렬된 일정을 달별로 묶는다. 지난 날짜와 이번 달 항목은 이번 달 묶음에 — 놓친 일을 따로 숨기지 않는다.
 * 입학 1~2년 전처럼 시기 없는 항목은 맨 뒤 하나의 묶음.
 */
export const groupTimeline = (entries: TimelineEntry[], now = new Date()): TimelineGroup[] => {
  const current = now.getMonth() + 1
  const today = startOfDay(now)
  const groups: TimelineGroup[] = []
  for (const entry of entries) {
    let month: number | null
    if (entry.when.kind === 'anytime') month = null
    else if (entry.when.kind === 'month') month = entry.when.month
    else {
      const date = parseDate(entry.when.date)
      month = !date ? null : date < today ? current : date.getMonth() + 1
    }
    const existing = groups.find((group) => group.month === month)
    if (existing) existing.entries.push(entry)
    else groups.push({ month, entries: [entry] })
  }
  return groups
}

/** 완료 표시(UX-10): "이번 달 챙길 것 3개 중 3개 ✓". 다 했을 때만 ✓. 셀 것이 없으면 null. */
export const describeProgress = (entries: TimelineEntry[], planning = false): string | null => {
  if (!entries.length) return null
  const done = entries.filter((entry) => entry.done).length
  return `${planning ? '지금 챙길 것' : '이번 달 챙길 것'} ${entries.length}개 중 ${done}개${done === entries.length ? ' ✓' : ''}`
}

/** 마지막으로 연 뒤 지난 날 수(달력 기준). 기록이 없거나 깨졌으면 null. */
export const daysSince = (lastSeenAt: string | null | undefined, now = new Date()): number | null => {
  if (!lastSeenAt) return null
  const last = new Date(lastSeenAt)
  if (Number.isNaN(last.getTime())) return null
  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(last).getTime()) / DAY))
}

/** 지난 방문 뒤 일정에서 달라진 것(UX-18). */
export interface PlanChanges {
  /** 지난 방문 시각. */
  since: Date
  /** 달이 바뀌었으면 이번 달과 이번 달에 남은 일 수. */
  newMonth: { month: number; open: number } | null
  /** 지난 방문 뒤 날짜가 지났는데 아직 안 한 일. */
  missed: TimelineEntry[]
  /** 지난 방문 땐 2주 밖이었다가 이제 2주 안으로 들어온 일. */
  nearing: TimelineEntry[]
}

const SOON = 14

/**
 * 하루 이상 지나 돌아왔을 때 알려 줄 변화. 달이 바뀐 것, 그 사이 지난 날짜, 새로 다가온 날짜만 —
 * 그 전부터 지나 있던 일은 이미 본 것이라 다시 알리지 않는다. 달라진 게 없으면 null.
 */
export const planChangesSince = (entries: TimelineEntry[], lastSeenAt: string | null | undefined, now = new Date()): PlanChanges | null => {
  const days = daysSince(lastSeenAt, now)
  if (days === null || days < 1) return null
  const since = new Date(lastSeenAt!)
  const month = now.getMonth() + 1
  const monthChanged = since.getFullYear() !== now.getFullYear() || since.getMonth() + 1 !== month
  const open = entries.filter((entry) => !entry.done)
  const current = groupTimeline(open, now).find((group) => group.month === month)
  const missed = open.filter((entry) => {
    const left = daysUntil(entry.when, now)
    const before = daysUntil(entry.when, since)
    return left !== null && before !== null && left < 0 && before >= 0
  })
  const nearing = open.filter((entry) => {
    const left = daysUntil(entry.when, now)
    const before = daysUntil(entry.when, since)
    return left !== null && before !== null && left >= 0 && left <= SOON && before > SOON
  })
  const newMonth = monthChanged ? { month, open: current?.entries.length ?? 0 } : null
  if (!newMonth && !missed.length && !nearing.length) return null
  return { since, newMonth, missed, nearing }
}

const validWhen = (value: unknown): value is TimelineWhen => {
  if (!value || typeof value !== 'object') return false
  const when = value as TimelineWhen
  if (when.kind === 'anytime') return true
  if (when.kind === 'month') return Number.isInteger(when.month) && when.month >= 1 && when.month <= 12
  if (when.kind === 'date') return typeof when.date === 'string' && parseDate(when.date) !== null
  return false
}

export const validPinned = (value: unknown): value is PinnedItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as PinnedItem
  return typeof item.id === 'string' && item.id.length > 0 && typeof item.title === 'string'
    && typeof item.href === 'string' && item.href.startsWith('/') && typeof item.addedAt === 'string' && validWhen(item.when)
}
