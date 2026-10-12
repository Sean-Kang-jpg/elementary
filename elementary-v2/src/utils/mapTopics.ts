import type { AcademyAddress, CareCenter } from '../types'

export const MAP_TOPICS = [
  { key: 'school', label: '학교' },
  { key: 'care', label: '방과후·돌봄' },
  { key: 'assignment', label: '배정·통학' },
  { key: 'activity', label: '배움·활동' },
] as const

export type MapTopic = typeof MAP_TOPICS[number]['key']
export type SelectedMapPlace = { kind: 'care'; data: CareCenter } | { kind: 'activity'; data: AcademyAddress }
