// 홈 고민 목록. scripts/build-shell-pages.mjs의 worryCards()와 규칙을 함께 바꾼다.

export interface WorryItem {
  id: string
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

/** 날짜 창 없는 검색을 먼저, 시기별 고민은 마감 가까운 순·원래 순서대로. */
export const worryCards = (items: WorryItem[], now: Date, max: number): WorryCard[] => {
  const today = monthDay(now)
  const iso = `${now.getFullYear()}-${today}`
  return items
    .filter((item) => (!item.from && !item.to) || Boolean(item.from && item.to && inWindow(today, item.from, item.to)))
    .map((item, index) => ({
      ...item,
      dday: item.deadline ? daysUntil(now, item.deadline) : null,
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
    place: string
    path: string
    grade1Students: number | null
    grade1PerClass: number | null
    apartments: number
    morning: string | null
    careEnd: string | null
    grade1Options: number | null
    customOptions: number | null
    days: ShowcaseDay[]
  }
  apartment: {
    name: string
    path: string
    households: number | null
    // 아파트 상세 '교육환경'과 같은 값: 400m·800m 안 기관 수, 800m 안 분야 상위 4개(키는 academyCategories)
    academies?: { core: number | null; extended: number | null; categories: { key: string; count: number }[] } | null
  } | null
}
