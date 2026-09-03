import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: React.ReactNode
  headerAction?: React.ReactNode
  snapPoints?: number[]
  defaultSnap?: number
  swipeDownBehavior?: 'close' | 'collapse'
  onSnapChange?: (snapIndex: number) => void
  closeLabel?: string
  className?: string
}

type DragMode = 'pending' | 'sheet' | 'content'

interface DragSession {
  startX: number
  startY: number
  lastY: number
  startTime: number
  lastTime: number
  startHeight: number
  startSnap: number
  mode: DragMode
  scrollElement: HTMLElement | null
}

const DEFAULT_SNAP_POINTS = [0.3, 0.6, 0.88]
const DIRECTION_LOCK_PX = 7
const SNAP_DISTANCE_PX = 44
const SNAP_VELOCITY_PX_MS = 0.45

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  headerAction,
  snapPoints = DEFAULT_SNAP_POINTS,
  defaultSnap = 0,
  swipeDownBehavior = 'close',
  onSnapChange,
  closeLabel = '상세 정보 닫기',
  className = '',
}) => {
  const [currentSnap, setCurrentSnap] = useState(defaultSnap)
  const [isDragging, setIsDragging] = useState(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [dragTranslate, setDragTranslate] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const dragHeightRef = useRef<number | null>(null)

  const heightForSnap = useCallback((index: number) => {
    const safeIndex = Math.min(Math.max(index, 0), snapPoints.length - 1)
    return snapPoints[safeIndex] * window.innerHeight
  }, [snapPoints])

  const commitSnap = useCallback((nextSnap: number) => {
    const safeSnap = Math.min(Math.max(nextSnap, 0), snapPoints.length - 1)
    setCurrentSnap(safeSnap)
    onSnapChange?.(safeSnap)
  }, [onSnapChange, snapPoints.length])

  const findScrollElement = useCallback((target: EventTarget | null) => {
    let element = target instanceof HTMLElement ? target : null
    while (element && element !== sheetRef.current) {
      const style = window.getComputedStyle(element)
      const canScroll = /(auto|scroll)/.test(style.overflowY)
        && element.scrollHeight > element.clientHeight + 1
      if (canScroll) return element
      element = element.parentElement
    }
    return contentRef.current
  }, [])

  const startDrag = useCallback((
    clientX: number,
    clientY: number,
    target: EventTarget | null,
    mode: DragMode = 'pending',
  ) => {
    const now = performance.now()
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      lastY: clientY,
      startTime: now,
      lastTime: now,
      startHeight: heightForSnap(currentSnap),
      startSnap: currentSnap,
      mode,
      scrollElement: findScrollElement(target),
    }
    dragHeightRef.current = null
    setDragHeight(null)
    setDragTranslate(0)
  }, [currentSnap, findScrollElement, heightForSnap])

  const moveDrag = useCallback((clientX: number, clientY: number, preventDefault: () => void) => {
    const drag = dragRef.current
    if (!drag) return

    const deltaX = clientX - drag.startX
    const deltaY = clientY - drag.startY
    if (drag.mode === 'pending') {
      if (Math.abs(deltaY) < DIRECTION_LOCK_PX) return
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        drag.mode = 'content'
        return
      }

      const movingUp = deltaY < 0
      const contentAtTop = !drag.scrollElement || drag.scrollElement.scrollTop <= 1
      drag.mode = (movingUp && drag.startSnap < snapPoints.length - 1)
        || (!movingUp && contentAtTop)
        ? 'sheet'
        : 'content'
    }

    if (drag.mode !== 'sheet') return
    preventDefault()
    setIsDragging(true)

    const minimumHeight = heightForSnap(0)
    const maximumHeight = heightForSnap(snapPoints.length - 1)
    const requestedHeight = drag.startHeight - deltaY
    const nextHeight = Math.min(Math.max(requestedHeight, minimumHeight), maximumHeight)
    const nextTranslate = requestedHeight < minimumHeight
      ? Math.min(minimumHeight - requestedHeight, window.innerHeight * 0.35)
      : 0

    drag.lastY = clientY
    drag.lastTime = performance.now()
    dragHeightRef.current = nextHeight
    setDragHeight(nextHeight)
    setDragTranslate(nextTranslate)
  }, [heightForSnap, snapPoints.length])

  const finishDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.mode !== 'sheet') {
      setIsDragging(false)
      return
    }

    const elapsed = Math.max(drag.lastTime - drag.startTime, 1)
    const velocity = (drag.lastY - drag.startY) / elapsed
    const distance = drag.lastY - drag.startY
    const movedDown = distance > SNAP_DISTANCE_PX || velocity > SNAP_VELOCITY_PX_MS
    const movedUp = distance < -SNAP_DISTANCE_PX || velocity < -SNAP_VELOCITY_PX_MS

    if (movedDown && swipeDownBehavior === 'close') {
      onClose()
    } else if (movedDown && drag.startSnap === 0) {
      onClose()
    } else if (movedDown) {
      commitSnap(drag.startSnap - 1)
    } else if (movedUp) {
      commitSnap(drag.startSnap + 1)
    } else {
      const currentHeight = dragHeightRef.current ?? drag.startHeight
      const nearestSnap = snapPoints.reduce((nearest, point, index) => (
        Math.abs(point * window.innerHeight - currentHeight)
          < Math.abs(snapPoints[nearest] * window.innerHeight - currentHeight)
          ? index
          : nearest
      ), drag.startSnap)
      commitSnap(nearestSnap)
    }

    dragHeightRef.current = null
    setDragHeight(null)
    setDragTranslate(0)
    setIsDragging(false)
  }, [commitSnap, onClose, snapPoints, swipeDownBehavior])

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('input, textarea, select, [role="slider"], [data-bottom-sheet-no-drag]')) return
    const touch = event.touches[0]
    startDrag(touch.clientX, touch.clientY, event.target)
  }

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    moveDrag(touch.clientX, touch.clientY, () => event.preventDefault())
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    startDrag(event.clientX, event.clientY, event.target, 'sheet')
    setIsDragging(true)
  }

  useEffect(() => {
    if (isOpen) {
      setCurrentSnap(defaultSnap)
      setDragHeight(null)
      setDragTranslate(0)
      onSnapChange?.(defaultSnap)
    }
  }, [defaultSnap, isOpen, onSnapChange])

  useEffect(() => {
    if (!isDragging || !dragRef.current) return

    const handleMouseMove = (event: MouseEvent) => {
      moveDrag(event.clientX, event.clientY, () => event.preventDefault())
    }
    const handleMouseUp = () => finishDrag()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [finishDrag, isDragging, moveDrag])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="app-sheet-layer pointer-events-none fixed inset-0">
      <div
        ref={sheetRef}
        data-testid="bottom-sheet"
        data-snap-index={currentSnap}
        className={`pointer-events-auto absolute left-0 right-0 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-4px_15px_rgba(0,0,0,0.15)] ${isDragging ? '' : 'transition-[height,transform] duration-300 ease-out'} ${className}`}
        style={{
          bottom: 'var(--app-bottom-inset)',
          height: dragHeight === null ? `${snapPoints[currentSnap] * 100}dvh` : `${dragHeight}px`,
          maxHeight: 'calc(100dvh - var(--app-bottom-inset))',
          transform: dragTranslate > 0 ? `translateY(${dragTranslate}px)` : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishDrag}
        onTouchCancel={finishDrag}
      >
        <div
          className="drag-handle flex h-7 min-h-0 w-full justify-center py-2"
          onMouseDown={handleMouseDown}
          role="separator"
          aria-label="정보창 높이 조절"
          aria-orientation="horizontal"
        >
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {title && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 pb-3">
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900">{title}</h2>
            <div className="flex flex-none items-center gap-1" data-bottom-sheet-no-drag>
              {headerAction}
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="rounded-md p-2 transition-colors hover:bg-gray-100"
              >
                <X className="text-gray-500" size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <div ref={contentRef} data-testid="bottom-sheet-scroll" className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
