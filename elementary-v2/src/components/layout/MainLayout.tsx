import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import BottomNavigation from './BottomNavigation'
import type { AppView } from '../../utils/urlState'

interface MainLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  activeView: AppView
  onNavigate: (path: string) => void
}

function MainLayoutContent({ children, sidebar, activeView, onNavigate }: MainLayoutProps) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {activeView === 'map' && <Header />}
      {sidebar && <Sidebar>{sidebar}</Sidebar>}
      <main className="absolute inset-0 pb-app-gnb sm:pb-0">{children}</main>
      <BottomNavigation activeView={activeView} onNavigate={onNavigate} />
    </div>
  )
}

export default function MainLayout({ children, sidebar, activeView, onNavigate }: MainLayoutProps) {
  return (
    <MainLayoutContent sidebar={sidebar} activeView={activeView} onNavigate={onNavigate}>
      {children}
    </MainLayoutContent>
  )
}
