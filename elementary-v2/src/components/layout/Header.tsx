import QuickFilterBar from '../filters/QuickFilterBar'
import SearchBox from '../search/SearchBox'

export default function Header() {
  return (
    <header className="app-header pointer-events-none absolute left-0 right-0 top-0 p-3 sm:p-4">
      <div className="pointer-events-auto w-full sm:max-w-[520px]">
        <SearchBox className="w-full" />
        <QuickFilterBar />
      </div>
    </header>
  )
}
