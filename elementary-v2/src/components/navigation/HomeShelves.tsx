import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { CalendarClock, ChevronRight } from 'lucide-react'
import shelves from '../../content/home-shelves.json'
import { worryCards, type HomeShowcase, type WorryItem, type WorryCard } from '../../utils/homeShelves'
import { followLink } from '../content/contentLinks'
import { markEntry, track, trackHomeWorryClick } from '../../utils/analytics'
import { planPath, timetablePath } from '../../utils/urlState'
import { getAcademyCategory, type AcademyCategoryKey } from '../../utils/academyCategories'
import { nextDateOf } from '../../utils/familyPlan'
import AddToPlanButton from '../content/AddToPlanButton'

// 막대 축: 정오~19시 30분 (학교 상세 '초1 오후 한눈에'와 같다)
const T0 = 12 * 60
const T1 = 19 * 60 + 30
const toMin = (value: string | null) => (value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null)
const pct = (m: number) => ((Math.min(Math.max(m, T0), T1) - T0) / (T1 - T0)) * 100
const span = (from: number | null, to: number | null) =>
  from !== null && to !== null && to > from ? { left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` } : null

/** 빌드가 쓴 대표 학교 스냅샷. 개발 서버에는 파일이 없어 줄이 빠진다. */
const useShowcase = (enabled: boolean) => {
  const [data, setData] = useState<HomeShowcase | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    fetch('/home-showcase.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (active && json?.school) setData(json as HomeShowcase) })
      .catch(() => {})
    return () => { active = false }
  }, [enabled])
  return data
}

/**
 * 홈의 고민 목록과 학교 예시. HomePage가 검색창 앞뒤로 나누어 배치한다.
 * 날짜 창·목록 선택은 scripts/build-shell-pages.mjs의 정적 홈과 함께 바꾼다.
 */
export default function HomeShelves({ onNavigate, part = 'all' }: { onNavigate: (path: string) => void; part?: 'all' | 'worries' | 'showcase' }) {
  const cards = useMemo(() => worryCards(shelves.worries.items as WorryItem[], new Date(), shelves.worries.max), [])
  const showcase = useShowcase(part !== 'worries')
  const openWorry = (card: WorryCard) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    trackHomeWorryClick({ worry_id: card.id })
    markEntry('home')
    if (card.href === '#home-assignment-search') {
      event.preventDefault()
      const search = document.getElementById('home-assignment-search')
      search?.scrollIntoView({ block: 'center' })
      search?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()
    } else {
      followLink(event, card.href, onNavigate)
    }
  }
  const go = (shelf: string, id: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    track('home_shelf_click', { shelf, item: id })
    followLink(event, href, onNavigate)
  }

  return (
    <>
      {part !== 'showcase' && cards.length > 0 && (
        <section className="home-shelf home-worries" aria-labelledby="home-worries-title">
          <div className="home-shelf__head"><h2 id="home-worries-title">{shelves.worries.title}</h2></div>
          <ul className="home-worries__list">
            {cards.map((card) => {
              const date = card.deadline ? nextDateOf(card.deadline) : null
              return (
                <li key={card.id} className="worry-item" data-worry-id={card.id}>
                  <a href={card.href} className="worry-card" onClick={openWorry(card)}>
                    {card.dday !== null
                      ? <span className="worry-card__badge">{card.deadlineLabel} {card.dday === 0 ? 'D-day' : `D-${card.dday}`}</span>
                      : card.isNew ? <span className="worry-card__badge worry-card__badge--new">NEW</span> : null}
                    <strong>{card.question}</strong>
                    <small>{card.hint}</small>
                  </a>
                  {card.planId && <AddToPlanButton
                    item={{
                      id: card.planId,
                      title: card.question,
                      href: card.href,
                      when: date ? { kind: 'date', date } : { kind: 'month', month: new Date().getMonth() + 1 },
                    }}
                    from="home_worry"
                    contentId={card.id}
                  />}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {part !== 'worries' && showcase && <ShowcaseRow showcase={showcase} go={go} />}

      {/* 예시를 본 다음 바로 우리 학교로 짜 보게 한다(2026-10-19). 예시 줄이 없는 개발 서버에서도 보인다. */}
      {part !== 'worries' && <a href={planPath('week')} className="timetable-banner" onClick={go('banner', 'timetable', planPath('week'))}>
        <span className="timetable-banner__icon"><CalendarClock size={20} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <strong>우리 아이 초등학교 시간표 미리 짜보기</strong>
          <small>맞춤형·방과후·돌봄에 주변 학원까지, 입학 전에 한 주를 그려 봐요</small>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </a>}
    </>
  )
}

function ShowcaseRow({ showcase, go }: {
  showcase: HomeShowcase
  go: (shelf: string, id: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { school, apartment } = showcase
  const careEnd = toMin(school.careEnd)
  const monday = school.days.find((day) => day.dismissal) ?? null
  const morning = school.morning?.split('~') ?? null

  return (
    <section className="home-shelf" aria-labelledby="home-showcase-title">
      <div className="home-shelf__head">
        <h2 id="home-showcase-title">{shelves.showcase.title}</h2>
        <small>{shelves.showcase.lead}</small>
      </div>
      <ul className="home-shelf__row home-shelf__row--wide">
        <li>
          <a href={school.path} className="showcase-card" onClick={go('showcase', 'afternoon', school.path)}>
            <span className="showcase-card__kicker">초1 오후 한눈에</span>
            <strong>{school.name}</strong>
            <ol className="showcase-bars" aria-label={`${school.name} 요일별 하교와 방과후 종료`}>
              {school.days.map((day) => {
                const dismissal = toMin(day.dismissal)
                const after = toMin(day.afterschoolEnd)
                return (
                  <li key={day.label} className="contents">
                    <span className="showcase-bars__day">{day.label}</span>
                    <span className="showcase-bars__track" aria-hidden="true">
                      {span(dismissal, careEnd) && <span className="showcase-bars__care" style={span(dismissal, careEnd)!} />}
                      {span(T0, dismissal) && <span className="showcase-bars__class" style={span(T0, dismissal)!} />}
                      {span(dismissal, after) && <span className="showcase-bars__after" style={span(dismissal, after)!} />}
                    </span>
                    <span className="showcase-bars__end">{day.afterschoolEnd ?? day.dismissal ?? '–'}</span>
                  </li>
                )
              })}
            </ol>
            <span className="showcase-legend" aria-hidden="true">
              <span><i className="showcase-bars__class" />수업</span>
              <span><i className="showcase-bars__after" />방과후</span>
              {careEnd !== null && <span><i className="showcase-bars__care" />돌봄 ~{school.careEnd}</span>}
            </span>
            <small>요일별 하교·방과후·돌봄 시각을 학교마다 봐요</small>
          </a>
        </li>

        {apartment && (
          <li>
            <a href={apartment.path} className="showcase-card" onClick={go('showcase', 'assignment', apartment.path)}>
              <span className="showcase-card__kicker">배정 학교 찾기</span>
              <strong>{apartment.name} → {school.name}</strong>
              <div className="showcase-facts">
                <div><b>{school.grade1Students ?? '–'}명</b><span>1학년</span></div>
                <div><b>{school.grade1PerClass ?? '–'}명</b><span>학급당</span></div>
                <div><b>{school.apartments}곳</b><span>배정 아파트</span></div>
              </div>
              {apartment.academies && (
                <div className="showcase-academy">
                  <span className="showcase-academy__head">
                    교육환경 · 학원·교습소 400m <b>{apartment.academies.core ?? '–'}</b>곳 · 800m <b>{apartment.academies.extended ?? '–'}</b>곳
                  </span>
                  <span className="showcase-academy__chips">
                    {apartment.academies.categories.map(({ key, count }) => {
                      const category = getAcademyCategory(key as AcademyCategoryKey)
                      return <span key={key} style={{ color: category.color, background: category.softColor }}>{category.label} {count}</span>
                    })}
                  </span>
                </div>
              )}
              <small>{school.place} · 배정 관계, 학교 규모, 주변 학원 분야를 함께 봐요</small>
            </a>
          </li>
        )}

        {monday && (
          <li>
            <a href={timetablePath(school.id)} className="showcase-card" onClick={go('showcase', 'timetable', timetablePath(school.id))}>
              <span className="showcase-card__kicker">시간표 예시 · {monday.label}요일</span>
              <strong>맞벌이 가정의 하루</strong>
              <ol className="showcase-route">
                {morning && <li><b>{morning[0]}</b><span>아침돌봄 (~{morning[1]})</span></li>}
                <li><b>{monday.dismissal}</b><span>하교 → 방과후 강좌</span></li>
                {monday.afterschoolEnd && <li><b>{monday.afterschoolEnd}</b><span>방과후 끝 → 돌봄교실</span></li>}
                {school.careEnd && <li><b>{school.careEnd}</b><span>돌봄 끝, 데리러 가기</span></li>}
              </ol>
              <small>{school.name} 운영계획으로 만든 예시예요. 우리 학교로 직접 짜 보세요</small>
            </a>
          </li>
        )}
      </ul>
    </section>
  )
}
