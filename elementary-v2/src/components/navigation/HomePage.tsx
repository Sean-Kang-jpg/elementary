import { ChevronRight, Map } from 'lucide-react'
import type { MouseEvent } from 'react'
import SearchBox from '../search/SearchBox'
import { VIEW_PATHS } from '../../utils/urlState'

interface HomePageProps {
  onNavigate: (path: string) => void
}

/**
 * 첫 화면. 맨 위는 배정 검색창이다 (PRD 6.5절, ADR-008).
 *
 * 검색 결과를 고르면 선택이 바뀌고, App이 그 선택을 보고 상세 주소로 옮긴다.
 * 여기서는 지도를 그리지 않는다 — 지도는 처음 필요할 때 만들어진다.
 */
export default function HomePage({ onNavigate }: HomePageProps) {
  const openMap = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    onNavigate(VIEW_PATHS.map)
  }

  return (
    <section className="app-destination app-page home-page" aria-labelledby="home-title">
      <div className="home-page__inner">
        <p className="home-page__brand">어디초</p>
        <h1 id="home-title">우리 아파트는 어느 초등학교에 배정될까요?</h1>
        <p className="home-page__lead">학교명이나 아파트명을 검색해 공식 배정 관계를 확인하세요.</p>

        <SearchBox className="home-page__search" />

        <a href={VIEW_PATHS.map} onClick={openMap} className="home-page__card">
          <span className="home-page__card-icon"><Map size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>지도에서 찾아보기</strong>
            <small>지역을 옮겨 다니며 학교와 배정 아파트를 함께 봅니다.</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <p className="home-page__note">
          가까운 학교가 아니라 <b>배정되는 학교</b>를 보여줍니다. 공식 통학구역(학구도) 자료 기준입니다.
        </p>
      </div>
    </section>
  )
}
