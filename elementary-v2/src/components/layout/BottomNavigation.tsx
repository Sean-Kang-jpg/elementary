import { BookOpen, Home, Map, UserRound } from 'lucide-react'
import type { MouseEvent } from 'react'
import { VIEW_PATHS, type AppView } from '../../utils/urlState'

interface BottomNavigationProps {
  activeView: AppView
  onNavigate: (path: string) => void
}

const items = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'map', label: '지도', icon: Map },
  { id: 'guide', label: '입학 준비', icon: BookOpen },
  { id: 'my', label: 'MY', icon: UserRound },
] as const

export default function BottomNavigation({ activeView, onNavigate }: BottomNavigationProps) {
  // 진짜 링크로 둔다. 화면마다 주소가 있으므로 새 탭으로 열기와 주소 복사가 그대로 된다.
  const follow = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    onNavigate(path)
  }

  return (
    <nav className="app-gnb" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon }) => {
        // FAQ는 가이드 목록 아래에 있으므로 가이드 탭이 켜진다. 지역 허브는 학교를
        // 찾는 다른 길이므로 지도 탭이 켜진다.
        const isActive = activeView === id
          || (id === 'guide' && (activeView === 'faq' || activeView === 'checklist'))
          || (id === 'map' && activeView === 'area')
        const path = VIEW_PATHS[id]
        return (
          <a
            key={id}
            href={path}
            onClick={(event) => follow(event, path)}
            aria-current={isActive ? 'page' : undefined}
            className={`app-gnb__item ${isActive ? 'app-gnb__item--active' : ''}`}
          >
            <Icon size={21} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
            <span>{label}</span>
          </a>
        )
      })}
    </nav>
  )
}
