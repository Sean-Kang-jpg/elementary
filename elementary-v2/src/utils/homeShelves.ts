// 홈 고민 목록. scripts/build-shell-pages.mjs의 worryCards()와 규칙을 함께 바꾼다.

export interface WorryItem {
  id: string
  year?: number // 특정 연도에만 노출하는 일정
  from?: string // 'MM-DD', 날짜 창 없는 항목은 항상 맨 앞
  to?: string // 'MM-DD', from보다 앞이면 해를 넘기는 창
  deadline?: string // 'MM-DD'
  deadlineLabel?: string
  newUntil?: string // 'YYYY-MM-DD'
  question: string
  hint: string
  href: string
  planId?: string
}

export interface WorryCard extends WorryItem {
  dday: number | null
  isNew: boolean
}

const monthDay = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const inWindow = (today: string, from: string, to: string) =>
  from <= to ? today >= from && today <= to : today >= from || today <= to

/** 오늘부터 다음 MM-DD까지 남은 날. 오늘이 그날이면 0. */
const daysUntil = (now: Date, mmdd: string) => {
  const [month, day] = mmdd.split('-').map(Number)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let target = new Date(now.getFullYear(), month - 1, day)
  if (target < start) target = new Date(now.getFullYear() + 1, month - 1, day)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

/** 마감이 이미 지났으면(창이 끝나기 전에 다음 마감이 오지 않으면) null — 내년 마감을 세지 않는다. */
const ddayOf = (now: Date, item: WorryItem) => {
  if (!item.deadline) return null
  const dday = daysUntil(now, item.deadline)
  return item.to && dday > daysUntil(now, item.to) ? null : dday
}

/** 날짜 창 없는 검색을 먼저, 시기별 고민은 마감 가까운 순·원래 순서대로. */
export const worryCards = (items: WorryItem[], now: Date, max: number): WorryCard[] => {
  const today = monthDay(now)
  const iso = `${now.getFullYear()}-${today}`
  return items
    .filter((item) => item.year === undefined || item.year === now.getFullYear())
    .filter((item) => (!item.from && !item.to) || Boolean(item.from && item.to && inWindow(today, item.from, item.to)))
    .map((item, index) => ({
      ...item,
      dday: ddayOf(now, item),
      isNew: Boolean(item.newUntil && iso <= item.newUntil),
      index,
      permanent: !item.from && !item.to,
    }))
    .sort((a, b) => Number(b.permanent) - Number(a.permanent) || (a.dday ?? 999) - (b.dday ?? 999) || a.index - b.index)
    .slice(0, max)
    .map((card) => {
      const { index, permanent, ...rest } = card
      void index
      void permanent
      return rest
    })
}

/** 활성 시기 안에서 마감이 가까운 항목 하나. 날짜 없는 항목은 기존 순서로 고른다. */
export const currentHomeCard = (items: WorryItem[], now: Date): WorryCard | undefined =>
  worryCards(items.filter((item) => item.from && item.to), now, items.length)
    .find((card) => !card.deadline || card.dday !== null)

export interface ShowcaseDay {
  label: string
  dismissal: string | null
  afterschoolEnd: string | null
}

/** 빌드가 dist/home-showcase.json으로 쓰는 대표 학교·아파트 스냅샷 (scripts/home-showcase.mjs). */
export interface HomeShowcase {
  generatedAt: string
  school: {
    id: string
    name: string
    careEnd: string | null
    days: ShowcaseDay[]
  }
}
