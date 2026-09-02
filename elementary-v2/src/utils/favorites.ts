import type { Apartment, School } from '../types'

const FAVORITES_KEY = 'elementary-favorites-v1'
const LEGACY_SCHOOLS_KEY = 'favorite-school-ids'
const FAVORITES_EVENT = 'elementary-favorites-change'

export type FavoriteRecord =
  | { kind: 'school'; id: string; name: string; address: string; latitude: number; longitude: number }
  | { kind: 'apartment'; id: string; name: string; address: string; latitude: number; longitude: number; schoolId: string; schoolName: string; households: number }

const isRecord = (value: unknown): value is FavoriteRecord => {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<FavoriteRecord>
  return (record.kind === 'school' || record.kind === 'apartment') && typeof record.id === 'string'
}

export const readFavorites = (): FavoriteRecord[] => {
  try {
    const records = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') as unknown[]
    const favorites = records.filter(isRecord)
    const legacyIds = JSON.parse(localStorage.getItem(LEGACY_SCHOOLS_KEY) || '[]') as unknown[]
    legacyIds.filter((id): id is string => typeof id === 'string').forEach((id) => {
      if (!favorites.some((item) => item.kind === 'school' && item.id === id)) {
        favorites.push({ kind: 'school', id, name: id, address: '', latitude: 0, longitude: 0 })
      }
    })
    if (legacyIds.length) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
      localStorage.removeItem(LEGACY_SCHOOLS_KEY)
    }
    return favorites
  } catch {
    return []
  }
}

const writeFavorites = (favorites: FavoriteRecord[]) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  window.dispatchEvent(new Event(FAVORITES_EVENT))
}

export const schoolFavorite = (school: School): FavoriteRecord => ({
  kind: 'school',
  id: school.school_id,
  name: school.school_name,
  address: school.address,
  latitude: school.latitude,
  longitude: school.longitude,
})

export const apartmentFavorite = (apartment: Apartment): FavoriteRecord => ({
  kind: 'apartment',
  id: apartment.id,
  name: apartment.name,
  address: apartment.address,
  latitude: apartment.latitude,
  longitude: apartment.longitude,
  schoolId: apartment.assigned_school_id,
  schoolName: apartment.assigned_school_name,
  households: apartment.households,
})

export const isFavorite = (kind: FavoriteRecord['kind'], id: string) => (
  readFavorites().some((item) => item.kind === kind && item.id === id)
)

export const toggleFavorite = (record: FavoriteRecord) => {
  const favorites = readFavorites()
  const exists = favorites.some((item) => item.kind === record.kind && item.id === record.id)
  const next = exists
    ? favorites.filter((item) => item.kind !== record.kind || item.id !== record.id)
    : [record, ...favorites]
  writeFavorites(next)
  return !exists
}

export const removeFavorite = (record: FavoriteRecord) => {
  writeFavorites(readFavorites().filter((item) => item.kind !== record.kind || item.id !== record.id))
}

export const subscribeFavorites = (listener: () => void) => {
  window.addEventListener(FAVORITES_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(FAVORITES_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
