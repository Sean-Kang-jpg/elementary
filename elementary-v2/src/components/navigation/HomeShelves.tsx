import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import shelves from '../../content/home-shelves.json'
import { seasonCards, type HomeShowcase, type SeasonItem } from '../../utils/homeShelves'
import { followLink } from '../content/contentLinks'
import { track } from '../../utils/analytics'
import { VIEW_PATHS } from '../../utils/urlState'
import { getAcademyCategory, type AcademyCategoryKey } from '../../utils/academyCategories'

// 막대 축: 정오~19시 30분 (학교 상세 '초1 오후 한눈에'와 같다)
const T0 = 12 * 60
const T1 = 19 * 60 + 30
const toMin = (value: string | null) => (value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null)
const pct = (m: number) => ((Math.min(Math.max(m, T0), T1) - T0) / (T1 - T0)) * 100
const span = (from: number | null, to: number | null) =>
  from !== null && to !== null && to > from ? { left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` } : null

/** 빌드가 쓴 대표 학교 스냅샷. 개발 서버에는 파일이 없어 줄이 빠진다. */
const useShowcase = () => {
  const [data, setData] = useState<HomeShowcase | null>(null)
  useEffect(() => {
    let active = true
    fetch('/home-showcase.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (active && json?.school) setData(json as HomeShowcase) })
      .catch(() => {})
    return () => { active = false }
  }, [])
  return data
}

/**
 * 홈의 두 줄 (2026-10-15): 날짜에 따라 바뀌는 '지금 챙길 것'과, 실제 학교 자료로 만든
 * '어디초로 볼 수 있는 것'. 정적 홈은 scripts/build-shell-pages.mjs가 같은 마크업으로 만든다.
 */
export default function HomeShelves({ onNavigate }: { onNavigate: (path: string) => void }) {
  const cards = useMemo(() => seasonCards(shelves.season.items as SeasonItem[], new Date(), shelves.season.max), [])
  const showcase = useShowcase()
  const go = (shelf: string, id: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    track('home_shelf_click', { shelf, item: id })
    followLink(event, href, onNavigate)
  }

  return (
    <>
      {cards.length > 0 && (
        <section className="home-shelf" aria-labelledby="home-season-title">
          <div className="home-shelf__head"><h2 id="home-season-title">{shelves.season.title}</h2></div>
          <ul className="home-shelf__row">
            {cards.map((card) => (
              <li key={card.id}>
                <a href={card.href} className="season-card" onClick={go('season', card.id, card.href)}>
                  {card.dday !== null
                    ? <span className="season-card__badge">{card.deadlineLabel} {card.dday === 0 ? 'D-day' : `D-${card.dday}`}</span>
                    : card.isNew ? <span className="season-card__badge season-card__badge--new">NEW</span> : null}
                  <strong>{card.title}</strong>
                  <small>{card.body}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showcase && <ShowcaseRow showcase={showcase} go={go} />}
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
            <a href={VIEW_PATHS.my} className="showcase-card" onClick={go('showcase', 'timetable', VIEW_PATHS.my)}>
              <span className="showcase-card__kicker">MY 시간표 예시 · {monday.label}요일</span>
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
