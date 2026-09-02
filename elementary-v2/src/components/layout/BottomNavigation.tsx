import { Map, Newspaper, Star } from 'lucide-react'

export type AppTab = 'map' | 'news' | 'favorites'

interface BottomNavigationProps {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
}

const items = [
  { id: 'map', label: '지도', icon: Map },
  { id: 'news', label: '소식', icon: Newspaper },
  { id: 'favorites', label: '즐겨찾기', icon: Star },
] as const

export default function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="app-gnb" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`app-gnb__item ${isActive ? 'app-gnb__item--active' : ''}`}
          >
            <Icon size={21} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
