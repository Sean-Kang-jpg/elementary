import { BookOpen, CalendarClock, Map, MessagesSquare } from 'lucide-react'
import { VIEW_PATHS, type AppView } from '../../utils/urlState'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { followLink } from '../content/contentLinks'

interface BottomNavigationProps {
  activeView: AppView
  onNavigate: (path: string) => void
}

// 2026-10-21: 홈 탭은 상단 로고로, MY는 상단 오른쪽 아이콘으로 옮겼다(AppTopBar). 메뉴는 넷이다.
const items = [
  { id: 'map', label: '학교 찾기', icon: Map },
  { id: 'guide', label: '입학 준비', icon: BookOpen },
  { id: 'timetable', label: '시간표', icon: CalendarClock },
  ...(FRONTYARD_ENABLED ? [{ id: 'frontyard', label: '앞마당', icon: MessagesSquare }] as const : []),
] as const

export default function BottomNavigation({ activeView, onNavigate }: BottomNavigationProps) {
  // 진짜 링크로 둔다. 화면마다 주소가 있으므로 새 탭으로 열기와 주소 복사가 그대로 된다.
  return (
    <nav className="app-gnb" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon }) => {
        // FAQ는 가이드 목록 아래에 있으므로 가이드 탭이 켜진다. 지역 허브는 학교를
        // 찾는 다른 길이므로 학교 찾기 탭이 켜진다.
        const isActive = activeView === id
          || (id === 'guide' && (activeView === 'faq' || activeView === 'checklist'))
          || (id === 'map' && activeView === 'area')
        const path = VIEW_PATHS[id]
        return (
          <a
            key={id}
            href={path}
            onClick={(event) => followLink(event, path, onNavigate)}
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
