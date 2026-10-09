import { CalendarClock, ChevronRight, Flag, Home, Repeat, Sprout } from 'lucide-react'
import { followLink } from '../content/contentLinks'
import { LEARNING, LEARNING_CATEGORIES, subcategoryLabel, type LearningCategory } from '../../content'
import { guidePath, learnPath, VIEW_PATHS } from '../../utils/urlState'

interface LearnPageProps {
  onNavigate: (path: string) => void
}

/**
 * 학습 준비 메뉴의 첫 화면 (2026-10-08 개편 계획 §1).
 *
 * 두 가지를 담는다: 학교별 초1 시간표 조회, 그리고 환경·습관·배움 콘텐츠(P2). 학교별 시간표는
 * 학교 상세의 "초1 하루 예상" 카드에 있어 여기서는 학교 찾기로 보낸다. 콘텐츠는 빌드가 발행본만
 * 싣고(`npm run dev`는 검수 중인 것도), 글이 아직 없는 분류는 '준비 중'으로 둔다.
 * 선택·준비물은 입학 준비 메뉴 소속이라 여기 없다. 시간표 짜기는 로그인이 켜지는 P3에서 붙인다.
 */
const CATEGORY_ICONS: Partial<Record<LearningCategory, typeof Home>> = { environment: Home, habit: Repeat, learning: Sprout }

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
        {LEARNING_CATEGORIES.filter((category) => category.menu === 'learn').map((category) => {
          const Icon = CATEGORY_ICONS[category.id] ?? Sprout
          const items = LEARNING.filter((item) => item.category === category.id)
          return (
            <section key={category.id} className="content-list" aria-label={category.label}>
              <h3 className="content-list__title">{category.label}</h3>
              {items.length ? items.map((item) => (
                <a key={item.slug} href={learnPath(item.slug)} onClick={(event) => followLink(event, learnPath(item.slug), onNavigate)} className="content-list__item content-list__item--card">
                  <span className="home-link__icon home-link__icon--peach"><Icon size={19} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{item.title}</strong>
                    <small>{subcategoryLabel(item)}{item.status !== 'published' ? ' · 검수 중' : ''}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              )) : (
                <div className="content-list__item content-list__item--card">
                  <span className="home-link__icon home-link__icon--peach"><Icon size={19} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{category.label}</strong>
                    <small>{category.note} · 준비 중</small>
                  </span>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
