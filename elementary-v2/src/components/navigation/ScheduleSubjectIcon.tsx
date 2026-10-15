import { Blocks, BookOpen, Calculator, CalendarDays, FlaskConical, Footprints, House, Laptop, Music2, Palette, School, Volleyball, type LucideIcon } from 'lucide-react'
import { scheduleEntrySubject, type ScheduleSubject } from '../../utils/schedule/calendar'
import type { ScheduleEntry } from '../../utils/schedule/types'

const SUBJECT_ICONS: Record<ScheduleSubject, LucideIcon> = {
  school: School, care: House, art: Palette, music: Music2, dance: Footprints,
  sports: Volleyball, coding: Laptop, science: FlaskConical, reading: BookOpen,
  math: Calculator, activities: Blocks, personal: CalendarDays,
}

/** Decorative SVG only: the card's accessible name already includes the program. */
export default function ScheduleSubjectIcon({ entry }: { entry: Pick<ScheduleEntry, 'kind' | 'label'> }) {
  const subject = scheduleEntrySubject(entry)
  const Icon = SUBJECT_ICONS[subject]
  return <span className="my-entry-icon" aria-hidden="true" data-subject={subject}><Icon size={14} strokeWidth={1.8} focusable="false" /></span>
}
