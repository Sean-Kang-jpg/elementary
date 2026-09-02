import { Building2, ChevronRight, GraduationCap, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FavoriteRecord, readFavorites, removeFavorite, subscribeFavorites } from '../../utils/favorites'

interface FavoritesPageProps {
  onOpen: (favorite: FavoriteRecord) => void
}

export default function FavoritesPage({ onOpen }: FavoritesPageProps) {
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(readFavorites)

  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])

  return (
    <section className="app-destination app-page" aria-labelledby="favorites-title">
      <header className="app-page__header">
        <h1 id="favorites-title">즐겨찾기</h1>
        <span>{favorites.length}개</span>
      </header>
      {favorites.length === 0 ? (
        <div className="app-destination__empty">
          <Star size={30} aria-hidden="true" />
          <p>즐겨찾기가 비어 있습니다.</p>
        </div>
      ) : (
        <div className="app-page__list">
          {favorites.map((favorite) => {
            const Icon = favorite.kind === 'school' ? GraduationCap : Building2
            return (
              <div key={`${favorite.kind}-${favorite.id}`} className="app-page__row">
                <button type="button" onClick={() => onOpen(favorite)} className="app-page__row-main">
                  <span className={`app-page__entity-icon ${favorite.kind === 'apartment' ? 'app-page__entity-icon--apartment' : ''}`}><Icon size={18} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{favorite.name}</strong>
                    <small>{favorite.address || (favorite.kind === 'apartment' ? favorite.schoolName : '학교 정보')}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => removeFavorite(favorite)} className="app-page__remove" aria-label={`${favorite.name} 즐겨찾기 삭제`}><Trash2 size={17} aria-hidden="true" /></button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
