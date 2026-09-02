import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import BottomNavigation, { AppTab } from './BottomNavigation'

interface MainLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
}

function MainLayoutContent({ children, sidebar, activeTab, onTabChange }: MainLayoutProps) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {activeTab === 'map' && <Header />}
      {sidebar && <Sidebar>{sidebar}</Sidebar>}
      <main className="absolute inset-0 pb-app-gnb sm:pb-0">{children}</main>
      <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  )
}

export default function MainLayout({ children, sidebar, activeTab, onTabChange }: MainLayoutProps) {
  return (
    <MainLayoutContent sidebar={sidebar} activeTab={activeTab} onTabChange={onTabChange}>
      {children}
    </MainLayoutContent>
  )
}
