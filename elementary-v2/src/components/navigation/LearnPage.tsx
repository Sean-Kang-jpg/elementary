import { CalendarClock, ChevronRight, Flag, Home, Repeat, Sprout } from 'lucide-react'
import { followLink } from '../content/contentLinks'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'

interface LearnPageProps {
  onNavigate: (path: string) => void
}

/**
 * 학습 준비 메뉴의 첫 화면 (2026-10-08 개편 계획 §1).
 *
 * 두 가지를 담는다: 환경·습관·배움 학습 가이드, 그리고 학교별 초1 시간표 조회.
 * 가이드는 P2 검수 전이라 준비 중으로 둔다. 학교별 시간표는 학교 상세의 "초1 하루 예상"
 * 카드(파일럿 35곳)에 있어, 여기서는 학교 찾기로 보낸다. 준비 중 상태로 배포한다(사용자 결정).
 * 시간표 짜기는 로그인이 켜지는 P3에서 로그인으로 보낸다.
 */
const GUIDE_GROUPS = [
  { id: 'environment', label: '환경', note: '책상 위치, 거실서재, 등교 준비존', icon: Home },
  { id: 'habit', label: '습관', note: '아침 준비, 수면 루틴, 영상 끄기', icon: Repeat },
  { id: 'learning', label: '배움', note: '한글, 초1 수학 범위, 독서', icon: Sprout },
] as const

export default function LearnPage({ onNavigate }: LearnPageProps) {
  return (
    <section className="app-destination app-page content-page" aria-labelledby="learn-title">
      <div className="content-page__inner">
        <h1 id="learn-title">학습 준비</h1>
        <p className="content-page__lead">초1 하루가 어떻게 흘러가는지 보고, 집에서 준비할 것을 골라요.</p>

        <h2>우리 학교 초1 시간표</h2>
        <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)} className="content-list__item content-list__item--card">
          <span className="home-link__icon home-link__icon--sage"><CalendarClock size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>학교별 요일별 예상 하교 시각</strong>
            <small>학교 찾기에서 학교를 고르면 상세에서 볼 수 있어요. 일부 학교부터 넓혀 가요.</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <a href={guidePath('first-weeks')} onClick={(event) => followLink(event, guidePath('first-weeks'), onNavigate)} className="content-list__item content-list__item--card">
          <span className="home-link__icon home-link__icon--sage"><Flag size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>입학식과 입학 첫 주</strong>
            <small>3월 첫 1~2주는 평소보다 일찍 끝나는 학교가 많아요.</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <h2>학습 가이드</h2>
        <ul className="content-list">
          {GUIDE_GROUPS.map(({ id, label, note, icon: Icon }) => (
            <li key={id} className="content-list__item content-list__item--card">
              <span className="home-link__icon home-link__icon--peach"><Icon size={19} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <strong>{label}</strong>
                <small>{note} · 준비 중</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
