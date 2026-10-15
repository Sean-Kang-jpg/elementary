import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { calendarRange, movedCalendarRange, GRID_END, GRID_START, type CalendarRange } from '../../utils/schedule/editing'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'

interface Gesture {
  pointerId: number
  element: HTMLElement
  timeline: HTMLElement
  x: number
  y: number
  weekday: Weekday
  anchor: number
  original?: ScheduleEntry
  start: number
  end: number
  grabOffset: number
  moved: boolean
  range: CalendarRange | null
  touch: boolean
  scrollLock?: { node: HTMLDivElement; overflowX: string; scrollSnapType: string }
}
const unlockScroll = (gesture: Gesture | null) => {
  if (!gesture?.scrollLock) return
  const { node, overflowX, scrollSnapType } = gesture.scrollLock
  node.style.overflowX = overflowX
  node.style.scrollSnapType = scrollSnapType
}
const rawTimeAt = (y: number, node: HTMLElement) => {
  const rect = node.getBoundingClientRect()
  return GRID_START + (y - rect.top) / rect.height * (GRID_END - GRID_START)
}
export default function useCalendarInteraction({ scroller, onCreate, onMove }: {
  scroller: RefObject<HTMLDivElement>
  onCreate: (range: CalendarRange) => void
  onMove: (original: ScheduleEntry, fromWeekday: Weekday, range: CalendarRange) => void
}) {
  const held = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const resetFrame = useRef<number>()
  const [preview, setPreview] = useState<CalendarRange | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const release = useCallback(() => {
    const gesture = held.current
    held.current = null
    unlockScroll(gesture)
    if (gesture?.element.hasPointerCapture(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId)
    setPreview(null)
    setMovingId(null)
    return gesture
  }, [])
  useEffect(() => {
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('blur', release)
      const gesture = held.current
      held.current = null
      unlockScroll(gesture)
      if (gesture?.element.hasPointerCapture(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId)
      if (resetFrame.current !== undefined) cancelAnimationFrame(resetFrame.current)
    }
  }, [release])
  const begin = (event: ReactPointerEvent<HTMLElement>, weekday: Weekday, original?: ScheduleEntry, start = 0, end = 0) => {
    if (!event.isPrimary || event.button !== 0) return
    const timeline = event.currentTarget.closest<HTMLElement>('.my-week__timeline')
    if (!timeline) return
    release()
    const anchor = rawTimeAt(event.clientY, timeline)
    const gesture: Gesture = { pointerId: event.pointerId, element: event.currentTarget, timeline, weekday, x: event.clientX, y: event.clientY,
      anchor, original, start, end, grabOffset: anchor - start, moved: false, range: null, touch: event.pointerType === 'touch' }
    // Stop native touch momentum/snap before moving a card so the day cannot slide underneath it.
    const node = scroller.current
    if (original && node) {
      const left = node.scrollLeft
      gesture.scrollLock = { node, overflowX: node.style.overflowX, scrollSnapType: node.style.scrollSnapType }
      node.style.scrollSnapType = 'none'
      node.style.overflowX = 'hidden'
      node.scrollLeft = left
    }
    held.current = gesture
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    if (event.pointerType !== 'touch' || original) event.preventDefault()
    event.stopPropagation()
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = held.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return
    if (gesture.touch && !gesture.original) { release(); return }
    gesture.moved = true
    if (gesture.original) {
      const target = [...(scroller.current?.querySelectorAll<HTMLElement>('.my-week__timeline') ?? [])].find((node) => {
        const rect = node.getBoundingClientRect()
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      })
      const weekday = Number(target?.closest<HTMLElement>('[data-weekday]')?.dataset.weekday) as Weekday
      gesture.range = target ? movedCalendarRange(weekday, gesture.start, gesture.end, rawTimeAt(event.clientY, target) - gesture.grabOffset) : null
      setMovingId(gesture.original.id)
    } else gesture.range = calendarRange(gesture.weekday, gesture.anchor, rawTimeAt(event.clientY, gesture.timeline))
    setPreview(gesture.range)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (held.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    const gesture = release()
    if (!gesture) return
    if (gesture.original) {
      if (!gesture.moved) return
      suppressClick.current = true
      resetFrame.current = requestAnimationFrame(() => { suppressClick.current = false })
      if (gesture.range) onMove(gesture.original, gesture.weekday, gesture.range)
    } else {
      const rect = gesture.timeline.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
      onCreate(gesture.range ?? calendarRange(gesture.weekday, gesture.anchor))
    }
  }
  return { preview, movingId, suppressClick, isPointerActive: () => held.current !== null,
    beginCreate: (event: ReactPointerEvent<HTMLElement>, weekday: Weekday) => begin(event, weekday),
    beginMove: (event: ReactPointerEvent<HTMLElement>, entry: ScheduleEntry, weekday: Weekday, start: number, end: number) => begin(event, weekday, entry, start, end),
    onPointerMove, onPointerUp,
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => { if (held.current?.pointerId === event.pointerId) release() },
    onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => { if (held.current?.pointerId === event.pointerId) release() },
    onEscape: () => { if (!held.current) return false; release(); return true },
  }
}
