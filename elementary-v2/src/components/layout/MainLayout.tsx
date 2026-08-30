import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

interface MainLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
}

function MainLayoutContent({ children, sidebar }: MainLayoutProps) {
  return (
    <div className="relative h-screen w-full overflow-hidden">
      <Header />
      {sidebar && <Sidebar>{sidebar}</Sidebar>}
      <main className="absolute inset-0">{children}</main>
    </div>
  )
}

export default function MainLayout({ children, sidebar }: MainLayoutProps) {
  return <MainLayoutContent sidebar={sidebar}>{children}</MainLayoutContent>
}
