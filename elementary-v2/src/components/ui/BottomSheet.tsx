/**
 * 바텀시트 컴포넌트
 * 모바일 친화적인 슬라이드업 UI
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: React.ReactNode
  headerAction?: React.ReactNode
  snapPoints?: number[] // 0-1 사이의 값들 (화면 높이 비율)
  defaultSnap?: number
  swipeDownBehavior?: 'close' | 'collapse'
  onSnapChange?: (snapIndex: number) => void
  closeLabel?: string
  className?: string
}

const DEFAULT_SNAP_POINTS = [0.3, 0.6, 0.9]

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
  className = ''
}) => {
  const [currentSnap, setCurrentSnap] = useState(defaultSnap)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // 화면 높이 기준 snap point 계산
  const translateY = isDragging ? Math.max(0, dragOffset) : 0

  // 드래그 시작
  const handleDragStart = (clientY: number) => {
    setIsDragging(true)
    setStartY(clientY)
    setDragOffset(0)
  }

  // 드래그 중
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return

    setDragOffset(clientY - startY)
  }, [isDragging, startY])

  // 드래그 끝
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return

    setIsDragging(false)
    const closeThreshold = Math.max(80, window.innerHeight * 0.08)
    const expandThreshold = Math.max(60, window.innerHeight * 0.06)

    if (dragOffset >= closeThreshold) {
      if (swipeDownBehavior === 'collapse') {
        if (currentSnap === 0) {
          onClose()
        } else {
          const nextSnap = Math.max(currentSnap - 1, 0)
          setCurrentSnap(nextSnap)
          onSnapChange?.(nextSnap)
        }
      } else {
        onClose()
      }
    } else if (dragOffset <= -expandThreshold) {
      setCurrentSnap((snap) => {
        const nextSnap = Math.min(snap + 1, snapPoints.length - 1)
        onSnapChange?.(nextSnap)
        return nextSnap
      })
    }
    setDragOffset(0)
  }, [currentSnap, dragOffset, isDragging, onClose, onSnapChange, snapPoints.length, swipeDownBehavior])

  // 터치 이벤트
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY)
  }

  const handleTouchEnd = () => {
    handleDragEnd()
  }

  // 마우스 이벤트 (데스크톱)
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY)
  }

  useEffect(() => {
    if (isOpen) {
      setCurrentSnap(defaultSnap)
      setDragOffset(0)
      onSnapChange?.(defaultSnap)
    }
  }, [defaultSnap, isOpen, onSnapChange])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY)
    }

    const handleMouseUp = () => {
      handleDragEnd()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleDragEnd, handleDragMove])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 바디 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50">
      <div
        ref={sheetRef}
        className={`pointer-events-auto absolute left-0 right-0 flex max-h-[70vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-4px_15px_rgba(0,0,0,0.15)] transition-all duration-300 ${className}`}
        style={{
          bottom: 0,
          height: `${snapPoints[currentSnap] * 100}vh`,
          transform: isDragging ? `translateY(${translateY}px)` : undefined
        }}
      >
        {/* 드래그 핸들 */}
        <div
          className="drag-handle flex h-7 min-h-0 w-full justify-center py-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* 헤더 */}
        {title && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 pb-3">
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900">{title}</h2>
            <div className="flex flex-none items-center gap-1">
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

        {/* 콘텐츠 */}
        <div className="min-h-0 flex-1 overflow-auto">
          {children}
        </div>

        {/* 스냅 포인트 인디케이터 (개발 환경) */}
      </div>
    </div>,
    document.body
  )
}

export default BottomSheet
