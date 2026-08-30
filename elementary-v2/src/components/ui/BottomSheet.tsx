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
  title?: string
  snapPoints?: number[] // 0-1 사이의 값들 (화면 높이 비율)
  defaultSnap?: number
  className?: string
}

const DEFAULT_SNAP_POINTS = [0.3, 0.6, 0.9]

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = DEFAULT_SNAP_POINTS,
  defaultSnap = 0,
  className = ''
}) => {
  const [currentSnap, setCurrentSnap] = useState(defaultSnap)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [currentY, setCurrentY] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // 화면 높이 기준 snap point 계산
  const snapHeight = snapPoints[currentSnap] * window.innerHeight
  const translateY = isDragging
    ? Math.max(0, currentY - snapHeight)
    : 0

  // 드래그 시작
  const handleDragStart = (clientY: number) => {
    setIsDragging(true)
    setStartY(clientY)
    setCurrentY(snapHeight)
  }

  // 드래그 중
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return

    const deltaY = clientY - startY
    const newY = snapHeight + deltaY
    setCurrentY(Math.max(0, newY))
  }, [isDragging, snapHeight, startY])

  // 드래그 끝
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return

    setIsDragging(false)

    // 가장 가까운 snap point 찾기
    const currentRatio = currentY / window.innerHeight
    let closestSnap = 0
    let minDiff = Math.abs(currentRatio - snapPoints[0])

    snapPoints.forEach((snap, index) => {
      const diff = Math.abs(currentRatio - snap)
      if (diff < minDiff) {
        minDiff = diff
        closestSnap = index
      }
    })

    // 너무 아래로 드래그하면 닫기
    if (currentRatio < 0.1) {
      onClose()
    } else {
      setCurrentSnap(closestSnap)
    }
  }, [currentY, isDragging, onClose, snapPoints])

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
          bottom: isDragging ? `-${translateY}px` : 0,
          height: `${snapPoints[currentSnap] * 100}vh`,
          transform: isDragging ? `translateY(${translateY}px)` : undefined
        }}
      >
        {/* 드래그 핸들 */}
        <div
          className="drag-handle flex justify-center py-3 touch-target"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-200">
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="상세 정보 닫기"
              className="rounded-md p-2 hover:bg-gray-100 transition-colors"
            >
              <X className="text-gray-500" size={20} aria-hidden="true" />
            </button>
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
