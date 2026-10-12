import { Building2, CarFront, ChevronDown, GraduationCap, Moon, SlidersHorizontal, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_FILTERS, useAppContext, useFilters, useUI } from '../../contexts/AppContext'
import { clearDataCache } from '../../services/dataService'
import type { FilterState } from '../../types'
import { MAP_TOPICS } from '../../utils/mapTopics'
import { ACADEMY_CATEGORIES } from '../../utils/academyCategories'

type FilterKey = 'schoolType' | 'grade' | 'students' | 'households' | 'parking' | 'evening'
type FilterScope = 'school' | 'assignment' | 'care'

const TYPE_OPTIONS: Array<{ label: string; value: FilterState['school_types'] }> = [
  { label: '전체', value: DEFAULT_FILTERS.school_types },
  { label: '공립', value: ['public'] },
  { label: '사립', value: ['private'] },
  { label: '국립', value: ['national'] },
]

const sameTypes = (a: FilterState['school_types'], b: FilterState['school_types']) => (
  a.length === b.length && a.every((value) => b.includes(value))
)

export default function QuickFilterBar() {
  const { state, dispatch } = useAppContext()
  const { filters, setFilter } = useFilters()
  const { toggleSidebar } = useUI()
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!openFilter) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpenFilter(null)
    }
    document.addEventListener('mousedown', close)
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setOpenFilter(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', keyboard, true)
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [openFilter])

  const apply = (next: Partial<FilterState>) => {
    clearDataCache()
    setFilter(next)
    setOpenFilter(null)
  }

  const typeLabel = TYPE_OPTIONS.find((option) => sameTypes(option.value, filters.school_types))?.label || '복수 선택'
  const items = [
    {
      key: 'schoolType' as const,
      scope: 'school' as FilterScope,
      label: typeLabel === '전체' ? '설립 유형' : typeLabel,
      active: typeLabel !== '전체',
      icon: GraduationCap,
      options: TYPE_OPTIONS.map((option) => ({ label: option.label, selected: sameTypes(option.value, filters.school_types), apply: () => apply({ school_types: option.value }) })),
    },
    {
      key: 'grade' as const,
      scope: 'school' as FilterScope,
      label: `${filters.target_grade}학년`,
      active: filters.target_grade !== 1,
      icon: GraduationCap,
      options: [1, 2, 3, 4, 5, 6].map((value) => ({ label: `${value}학년`, selected: filters.target_grade === value, apply: () => apply({ target_grade: value }) })),
    },
    {
      key: 'students' as const,
      scope: 'school' as FilterScope,
      label: filters.min_students ? `${filters.min_students}명+` : '학생 수',
      active: filters.min_students > 0,
      icon: Users,
      options: [0, 40, 80, 120].map((value) => ({ label: value ? `${value}명 이상` : '제한 없음', selected: filters.min_students === value, apply: () => apply({ min_students: value }) })),
    },
    {
      key: 'households' as const,
      scope: 'assignment' as FilterScope,
      label: filters.min_households ? `${filters.min_households.toLocaleString()}세대+` : '세대 수',
      active: filters.min_households > 0,
      icon: Building2,
      options: [0, 300, 500, 1000].map((value) => ({ label: value ? `${value.toLocaleString()}세대 이상` : '제한 없음', selected: filters.min_households === value, apply: () => apply({ min_households: value }) })),
    },
    {
      key: 'parking' as const,
      scope: 'assignment' as FilterScope,
      label: filters.min_parking_ratio ? `주차 ${filters.min_parking_ratio}대+` : '주차',
      active: filters.min_parking_ratio > 0,
      icon: CarFront,
      options: [0, 0.8, 1, 1.2, 1.5].map((value) => ({ label: value ? `세대당 ${value}대 이상` : '제한 없음', selected: filters.min_parking_ratio === value, apply: () => apply({ min_parking_ratio: value }) })),
    },
    {
      key: 'evening' as const,
      scope: 'care' as FilterScope,
      label: filters.evening_care_only ? '별도 저녁돌봄 공시 있음' : '저녁돌봄 공시',
      active: filters.evening_care_only,
      icon: Moon,
      options: [
        { label: '전체 학교', selected: !filters.evening_care_only, apply: () => apply({ evening_care_only: false }) },
        { label: '별도 저녁돌봄 교실 공시 있음', selected: filters.evening_care_only, apply: () => apply({ evening_care_only: true }) },
      ],
    },
  ]
  const activeItem = items.find((item) => item.key === openFilter)

  const toggleMenu = (key: FilterKey, button: HTMLButtonElement) => {
    triggerRef.current = button
    if (openFilter === key) {
      setOpenFilter(null)
      return
    }
    const bounds = button.getBoundingClientRect()
    setMenuPosition({
      top: bounds.bottom + 6,
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 300)),
    })
    setOpenFilter(key)
  }

  const groupItems = items.filter((item) => item.scope === state.mapTopic)

  return (
    <div ref={rootRef} className="quick-filter-shell">
      <button type="button" onClick={toggleSidebar} className="quick-filter-button quick-filter-button--all" aria-label="전체 필터 열기">
        <SlidersHorizontal size={17} aria-hidden="true" />
      </button>
      <div className="quick-filter-controls">
        <div className="quick-filter-row" role="group" aria-label="지도 탐색 영역">
          {MAP_TOPICS.map(({ key, label }) => (
            <button key={key} type="button" aria-pressed={state.mapTopic === key}
              onClick={() => { setOpenFilter(null); dispatch({ type: 'SET_MAP_TOPIC', payload: key }) }}
              className={`quick-filter-button ${state.mapTopic === key ? 'quick-filter-button--active' : ''}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="quick-filter-row" role="group" aria-label="종속 조건">
            {groupItems.map(({ key, label, active, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={(event) => toggleMenu(key, event.currentTarget)}
                aria-expanded={openFilter === key}
                className={`quick-filter-button ${active ? 'quick-filter-button--active' : ''}`}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            ))}
          {state.mapTopic === 'activity' && (
            <label className="quick-filter-button">활동 분야
              <select aria-label="활동 분야" value={state.activityCategory ?? ''}
                onChange={(event) => dispatch({ type: 'SET_ACTIVITY_CATEGORY', payload: ACADEMY_CATEGORIES.find(({ key }) => key === event.target.value)?.key ?? null })}>
                <option value="">전체 분야</option>
                {ACADEMY_CATEGORIES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          )}
          {state.mapTopic === 'care' && <span className="quick-filter-note">지역 돌봄센터 · 학교 기준 1km</span>}
        </div>
        {!state.selectedSchool && state.mapTopic !== 'school' && (
          <p className="quick-filter-note">학교나 아파트를 선택하면 {MAP_TOPICS.find(({ key }) => key === state.mapTopic)?.label} 정보를 볼 수 있어요.</p>
        )}
      </div>
      {activeItem && createPortal(
        <div
          ref={menuRef}
          className="quick-filter-menu"
          style={menuPosition}
          role="menu"
          aria-label={`${activeItem.label} 선택`}
          onKeyDown={(event) => {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
              : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
            if (next !== null) { event.preventDefault(); buttons[next]?.focus() }
          }}
        >
          {activeItem.options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitemradio"
              aria-checked={option.selected}
              onClick={option.apply}
              className={option.selected ? 'quick-filter-menu__item quick-filter-menu__item--selected' : 'quick-filter-menu__item'}
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
