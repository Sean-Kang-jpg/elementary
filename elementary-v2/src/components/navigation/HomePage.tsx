import { ChevronRight, Map } from 'lucide-react'
import type { MouseEvent } from 'react'
import SearchBox from '../search/SearchBox'
import { VIEW_PATHS } from '../../utils/urlState'
import copy from '../../content/home.json'

interface HomePageProps {
  onNavigate: (path: string) => void
}

/**
 * 첫 화면. 맨 위는 배정 검색창이다 (PRD 6.5절, ADR-008).
 *
 * 검색 결과를 고르면 선택이 바뀌고, App이 그 선택을 보고 상세 주소로 옮긴다.
 * 여기서는 지도를 그리지 않는다 — 지도는 처음 필요할 때 만들어진다.
 *
 * 문구는 content/home.json에 있다. 빌드가 같은 파일로 `/`의 정적 HTML을 만든다.
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
        <p className="home-page__brand">{copy.brand}</p>
        <h1 id="home-title">{copy.title}</h1>
        <p className="home-page__lead">{copy.lead}</p>

        <SearchBox className="home-page__search" />

        <a href={VIEW_PATHS.map} onClick={openMap} className="home-page__card">
          <span className="home-page__card-icon"><Map size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>{copy.mapCardTitle}</strong>
            <small>{copy.mapCardBody}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <p className="home-page__note">
          {copy.noteBefore}<b>{copy.noteStrong}</b>{copy.noteAfter}
        </p>
      </div>
    </section>
  )
}
