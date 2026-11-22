import type { SchoolAfterschool, SchoolDayEstimate } from '../../types'
import type { Weekday } from './types'

export function pickupTimeMinutes(value: string | null | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

export function dismissalForPickup(day: SchoolDayEstimate | null, weekday: Weekday) {
  const row = day?.weekdays.find((item) => item.weekday === weekday)
  return row?.note === 'school_check_needed' ? null : pickupTimeMinutes(row?.dismissal)
}

export function pickupProgramOptions(data: SchoolAfterschool | null, weekday: Weekday, dismissal: number) {
  return (data?.slots ?? []).flatMap((slot) => {
    if (slot.weekday !== weekday || slot.place === '돌봄내'
      || (slot.kind !== '맞춤형' && slot.kind !== '저학년방과후')) return []
    const start = pickupTimeMinutes(slot.start)
    const end = pickupTimeMinutes(slot.end)
    if (start === null || end === null || start < dismissal || end <= start) return []
    return [{ start, end, kind: slot.kind, estimated: slot.time_source === 'period_slot' }]
  })
}

export function pickupGap(pickup: number, dismissal: number | null) {
  if (dismissal === null) return { result: 'unknown', minutes: null } as const
  const minutes = pickup - dismissal
  const result = minutes < 0 ? 'early' : minutes === 0 ? 'same' : 'gap'
  return { result, minutes } as const
}
