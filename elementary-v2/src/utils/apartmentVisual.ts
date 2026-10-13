export type ApartmentEra = 'new' | 'mid' | 'old' | 'unknown'

/** Shared tones; age does not express a judgement of building quality. */
export const APARTMENT_PALETTE = {
  new: { surface: '#edf5f0', ink: '#376c59', body: '#fbfdfb', detail: '#a5cbb8' },
  mid: { surface: '#eff3f6', ink: '#52687c', body: '#f9fbfd', detail: '#b7c6d3' },
  old: { surface: '#f7f0e6', ink: '#806542', body: '#fffcf7', detail: '#d9c7aa' },
  unknown: { surface: '#f0f2f4', ink: '#606b78', body: '#fbfcfd', detail: '#c4cbd1' },
} as const

/** Keep the original positive serving-age preference; zero needs a valid year. */
export const apartmentAge = (age: number | null | undefined, builtYear: number | null | undefined, nowYear = new Date().getFullYear()): number | null => {
  if (typeof age === 'number' && Number.isFinite(age) && age > 0) return age
  if (typeof builtYear === 'number' && Number.isInteger(builtYear) && builtYear > 0 && builtYear <= nowYear) return nowYear - builtYear
  return null
}

export const apartmentEra = (age: number | null): ApartmentEra =>
  age === null || !Number.isFinite(age) || age < 0 ? 'unknown' : age <= 10 ? 'new' : age <= 25 ? 'mid' : 'old'

/** Symbolic density only, NOT physical building count; original thresholds. */
export const apartmentSilhouetteCount = (households: number): number =>
  households >= 3000 ? 4 : households >= 1000 ? 3 : households >= 300 ? 2 : 1

export const apartmentAgeLabel = (age: number | null): string => {
  const era = apartmentEra(age)
  return era === 'unknown' ? '연식 미확인' : era === 'new' ? '신축' : `${age}년차`
}
