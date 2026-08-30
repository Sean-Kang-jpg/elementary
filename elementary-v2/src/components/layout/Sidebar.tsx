import { X } from 'lucide-react'
import React from 'react'
import { useUI } from '../../contexts/AppContext'

interface SidebarProps {
  children: React.ReactNode
}

export default function Sidebar({ children }: SidebarProps) {
  const { ui, toggleSidebar } = useUI()
  const sidebarRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    if (ui.sidebar_open) sidebar.removeAttribute('inert')
    else sidebar.setAttribute('inert', '')
  }, [ui.sidebar_open])

  React.useEffect(() => {
    if (!ui.sidebar_open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggleSidebar()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [ui.sidebar_open, toggleSidebar])

  return (
    <>
      {ui.sidebar_open && (
        <button
          type="button"
          aria-label="필터 바깥 영역 닫기"
          className="fixed inset-0 z-40 bg-black/40"
          onClick={toggleSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        id="filter-sidebar"
        aria-hidden={!ui.sidebar_open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-80 flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${ui.sidebar_open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-950">필터 &amp; 검색</h2>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="필터 닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6 safe-area-bottom">{children}</div>
      </aside>
    </>
  )
}
