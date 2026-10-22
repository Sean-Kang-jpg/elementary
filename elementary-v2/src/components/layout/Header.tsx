import QuickFilterBar from '../filters/QuickFilterBar'
import SearchBox from '../search/SearchBox'
import { AppHomeLink, AppMyLink } from './AppTopBar'

/** 지도 화면의 상단. 지도를 덜 가리도록 상단 바 대신 검색창 양옆에 로고와 MY를 붙인다. */
export default function Header({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <header className="app-header pointer-events-none absolute left-0 right-0 top-0 p-3 sm:p-4">
      <div className="pointer-events-auto w-full">
        <div className="app-header__row">
          <AppHomeLink onNavigate={onNavigate} compact />
          <SearchBox className="min-w-0 flex-1 sm:max-w-[520px]" />
          <AppMyLink onNavigate={onNavigate} myActive={false} compact />
        </div>
        <QuickFilterBar />
      </div>
    </header>
  )
}
