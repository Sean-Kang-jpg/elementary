import { useEffect, useState, type MouseEvent } from 'react'
import shelves from '../../content/home-shelves.json'
import { currentHomeCard, type HomeShowcase, type WorryItem, type WorryCard } from '../../utils/homeShelves'
import { followLink } from '../content/contentLinks'
import { markEntry, track, trackHomeWorryClick } from '../../utils/analytics'
import { timetablePath } from '../../utils/urlState'
import { nextDateOf } from '../../utils/familyPlan'
import AddToPlanButton from '../content/AddToPlanButton'
import ShareButton from '../ui/ShareButton'

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

export default function HomeShelves({ onNavigate }: { onNavigate: (path: string) => void }) {
  const now = new Date()
  const card = currentHomeCard(shelves.worries.items as WorryItem[], now)
  const showcase = useShowcase()
  const openWorry = (card: WorryCard) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    trackHomeWorryClick({ worry_id: card.id })
    markEntry('home')
    followLink(event, card.href, onNavigate)
  }
  const go = (shelf: string, id: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    track('home_shelf_click', { shelf, item: id })
    followLink(event, href, onNavigate)
  }

  const date = card?.deadline && card.dday !== null ? nextDateOf(card.deadline, now) : null
  return (
    <>
      {showcase && <ShowcaseRow showcase={showcase} go={go} />}
      {card && (
        <section className="home-shelf home-worries" aria-labelledby="home-worries-title">
          <div className="home-shelf__head"><h2 id="home-worries-title">{shelves.worries.title}</h2></div>
          <ul className="home-worries__list">
            <li className="worry-item" data-worry-id={card.id}>
              <a href={card.href} className="worry-card" onClick={openWorry(card)}>
                {card.dday !== null && <span className="worry-card__badge">{card.deadlineLabel} {card.dday === 0 ? 'D-day' : `D-${card.dday}`}</span>}
                <strong>{card.question}</strong>
                <small>{card.hint}</small>
              </a>
              {card.planId && <div className="worry-actions">
                <AddToPlanButton
                  item={{
                    id: card.planId,
                    title: card.question,
                    href: card.href,
                    when: date ? { kind: 'date', date } : { kind: 'month', month: now.getMonth() + 1 },
                  }}
                  from="home_worry"
                  contentId={card.id}
                />
                <ShareButton path={card.href} title={card.question} text={card.hint} className="worry-action" />
              </div>}
            </li>
          </ul>
        </section>
      )}
    </>
  )
}

function ShowcaseRow({ showcase, go }: {
  showcase: HomeShowcase
  go: (shelf: string, id: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { school } = showcase
  const careEnd = toMin(school.careEnd)

  return (
    <section className="home-shelf" aria-labelledby="home-showcase-title">
      <div className="home-shelf__head">
        <h2 id="home-showcase-title">{shelves.showcase.title}</h2>
        <small>{shelves.showcase.lead}</small>
      </div>
      <ul className="home-shelf__row home-shelf__row--wide">
        <li>
          <a href={timetablePath(school.id)} className="showcase-card" onClick={go('showcase', 'afternoon', timetablePath(school.id))}>
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
            <small>예상 하교와 우리 집 픽업 시각을 맞춰 봐요</small>
          </a>
        </li>

      </ul>
    </section>
  )
}
