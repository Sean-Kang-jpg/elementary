import { SlidersHorizontal } from 'lucide-react'
import { useUI } from '../../contexts/AppContext'
import SearchBox from '../search/SearchBox'

export default function Header() {
  const { ui, toggleSidebar } = useUI()

  return (
    <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start gap-2 p-3 sm:p-4">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="필터 및 검색 열기"
        aria-controls="filter-sidebar"
        aria-expanded={ui.sidebar_open}
        className="pointer-events-auto inline-flex h-11 flex-none items-center gap-2 rounded-full bg-[#4285f4] px-4 text-sm font-semibold text-white shadow-md hover:bg-[#3367d6] focus:outline-none focus:ring-2 focus:ring-[#4285f4] focus:ring-offset-2"
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        <span className="hidden sm:inline">필터 &amp; 검색</span>
        <span className="sm:hidden">필터</span>
      </button>

      <div className="pointer-events-auto min-w-0 flex-1 sm:max-w-md">
        <SearchBox className="w-full drop-shadow-md" />
      </div>
    </header>
  )
}
