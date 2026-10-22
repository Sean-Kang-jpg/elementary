import { UserRound } from 'lucide-react'
import { VIEW_PATHS } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'

interface AppTopBarProps {
  onNavigate: (path: string) => void
  myActive: boolean
  /** 지도 화면: 검색창 양옆에 붙는 작은 모양. 글자 없이 로고와 MY 아이콘만. */
  compact?: boolean
}

/** 로고(홈으로)와 MY. 홈 탭을 없애면서 모든 화면 위에 둔다(2026-10-21). */
export function AppHomeLink({ onNavigate, compact = false }: Pick<AppTopBarProps, 'onNavigate' | 'compact'>) {
  return (
    <a href={VIEW_PATHS.home} className={`app-topbar__home${compact ? ' app-topbar__home--compact' : ''}`}
      onClick={(event) => followLink(event, VIEW_PATHS.home, onNavigate)} aria-label="어디초 홈">
      <img src="/logo.png" alt="" width={28} height={28} />
      {!compact && <span>어디초</span>}
    </a>
  )
}

export function AppMyLink({ onNavigate, myActive, compact = false }: AppTopBarProps) {
  return (
    <a href={VIEW_PATHS.my} className={`app-topbar__my${compact ? ' app-topbar__my--compact' : ''}`}
      onClick={(event) => followLink(event, VIEW_PATHS.my, onNavigate)}
      aria-label="MY" aria-current={myActive ? 'page' : undefined}>
      <UserRound size={22} strokeWidth={myActive ? 2.5 : 2} aria-hidden="true" />
    </a>
  )
}

export default function AppTopBar({ onNavigate, myActive }: AppTopBarProps) {
  return (
    <header className="app-topbar">
      <AppHomeLink onNavigate={onNavigate} />
      <AppMyLink onNavigate={onNavigate} myActive={myActive} />
    </header>
  )
}
