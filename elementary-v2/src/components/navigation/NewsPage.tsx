import { BookOpen, Building, Newspaper } from 'lucide-react'

const channels = [
  { label: '지역 리포트', icon: Building },
  { label: '학교 소식', icon: Newspaper },
  { label: '교육 서재', icon: BookOpen },
]

export default function NewsPage() {
  return (
    <section className="app-destination app-page" aria-labelledby="news-title">
      <header className="app-page__header"><h1 id="news-title">소식</h1></header>
      <div className="app-page__channels" aria-label="소식 분류">
        {channels.map(({ label, icon: Icon }) => <span key={label}><Icon size={17} aria-hidden="true" />{label}</span>)}
      </div>
      <div className="app-destination__empty">
        <Newspaper size={30} aria-hidden="true" />
        <p>등록된 소식이 없습니다.</p>
      </div>
    </section>
  )
}
