/**
 * 관심 학원 (인수인계서 4.1 Case C, 2026-10-23).
 *
 * 수업 시간을 몰라 시간표에는 못 넣지만 기억해 두고 싶은 학원. 관심 후보(favorites.ts, 학교·아파트
 * 각 3곳, 배정 비교용)와는 목적이 달라 따로 둔다. 이 기기에만 저장하고, 서버 저장(SQL 33)은 시간표와
 * 같은 익명 계정으로 나중에 옮긴다. key(etl/academy_institutions.py)가 있으면 그것으로, 없으면 이름과
 * 주소 ID로 같은 학원을 가린다 — 키는 2026-11 갱신부터 실린다.
 */

const KEY = 'elementary-saved-academies-v1'
const EVENT = 'elementary-saved-academies-change'
export const SAVED_ACADEMY_LIMIT = 30

export interface SavedAcademy {
  name: string
  /** 화면 표기용 분야(예: '수학'). */
  category: string
  /** 공개 학원 자료의 주소 ID(academy_address_serving.address_id). 도로명 주소는 공개하지 않는다. */
  addressId: string
  /** 화면 표기용 시·군·구(예: '서울특별시 강남구'). */
  area: string
  providerKey?: string
  savedAt: string
}

const valid = (value: unknown): value is SavedAcademy => {
  const item = value as Partial<SavedAcademy> | null
  return Boolean(item && typeof item.name === 'string' && item.name && typeof item.addressId === 'string'
    && typeof item.area === 'string' && typeof item.category === 'string' && typeof item.savedAt === 'string'
    && (item.providerKey === undefined || typeof item.providerKey === 'string'))
}

type Identity = Pick<SavedAcademy, 'name' | 'addressId' | 'providerKey'>
export const sameAcademy = (a: Identity, b: Identity) =>
  a.providerKey && b.providerKey ? a.providerKey === b.providerKey : a.name === b.name && a.addressId === b.addressId

export const readSavedAcademies = (): SavedAcademy[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(valid) : []
  } catch {
    return []
  }
}

const write = (items: SavedAcademy[]) => {
  // 실패(사생활 보호 모드·용량)는 부르는 쪽에 그대로 던진다 — 저장됐다고 말하지 않게.
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EVENT))
}

/** 저장돼 있으면 빼고, 없으면 맨 앞에 넣는다. 돌려주는 값은 바꾼 뒤 저장돼 있는지. */
export const toggleSavedAcademy = (academy: Omit<SavedAcademy, 'savedAt'>, now = new Date()): boolean => {
  const items = readSavedAcademies()
  if (items.some((item) => sameAcademy(item, academy))) {
    write(items.filter((item) => !sameAcademy(item, academy)))
    return false
  }
  if (items.length >= SAVED_ACADEMY_LIMIT) throw new Error(`관심 학원은 ${SAVED_ACADEMY_LIMIT}곳까지 저장할 수 있어요. MY에서 정리한 뒤 다시 저장해 주세요.`)
  write([{ ...academy, savedAt: now.toISOString() }, ...items])
  return true
}

export const removeSavedAcademy = (academy: SavedAcademy) => write(readSavedAcademies().filter((item) => !sameAcademy(item, academy)))

export const subscribeSavedAcademies = (listener: () => void) => {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener) }
}
