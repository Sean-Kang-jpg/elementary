import React, { useState } from 'react'
import { MousePointerClick } from 'lucide-react'
import Header from './Header'
import Sidebar from './Sidebar'
import BottomNavigation from './BottomNavigation'
import { PanelSlotContext } from './panelSlot'
import type { AppView } from '../../utils/urlState'

interface MainLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  activeView: AppView
  onNavigate: (path: string) => void
}

function MainLayoutContent({ children, sidebar, activeView, onNavigate }: MainLayoutProps) {
  // 모바일에서 패널은 자리만 차지하지 않는다(display: contents). 검색창은 지금처럼
  // 지도 위에 뜨고, 상세는 바텀시트로 열린다. 데스크톱에서만 왼쪽 패널이 된다.
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)
  return (
    <PanelSlotContext.Provider value={activeView === 'map' ? panelSlot : null}>
      <div className="app-viewport relative w-full overflow-hidden">
        {activeView === 'map' && (
          <div className="app-map-panel">
            <Header />
            <div ref={setPanelSlot} className="app-map-panel__body">
              <div className="app-map-panel__empty">
                <MousePointerClick size={28} aria-hidden="true" />
                <p>지도에서 학교나 지역을 누르거나<br />위에서 학교·아파트를 검색하세요.</p>
              </div>
            </div>
          </div>
        )}
        {sidebar && <Sidebar>{sidebar}</Sidebar>}
        <main className="app-main absolute inset-0 pb-app-gnb">{children}</main>
        <BottomNavigation activeView={activeView} onNavigate={onNavigate} />
      </div>
    </PanelSlotContext.Provider>
  )
}

export default function MainLayout({ children, sidebar, activeView, onNavigate }: MainLayoutProps) {
  return (
    <MainLayoutContent sidebar={sidebar} activeView={activeView} onNavigate={onNavigate}>
      {children}
    </MainLayoutContent>
  )
}
