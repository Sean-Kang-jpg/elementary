import { Building2, CarFront, ChevronDown, GraduationCap, SlidersHorizontal, Users } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_FILTERS, useFilters, useUI } from '../../contexts/AppContext'
import { clearDataCache } from '../../services/dataService'
import type { FilterState } from '../../types'

type FilterKey = 'schoolType' | 'grade' | 'students' | 'households' | 'parking'
type FilterScope = '학교' | '아파트'

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
  const { filters, setFilter } = useFilters()
  const { toggleSidebar } = useUI()
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openFilter) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpenFilter(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
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
      scope: '학교' as FilterScope,
      label: typeLabel === '전체' ? '설립 유형' : typeLabel,
      active: typeLabel !== '전체',
      icon: GraduationCap,
      options: TYPE_OPTIONS.map((option) => ({ label: option.label, selected: sameTypes(option.value, filters.school_types), apply: () => apply({ school_types: option.value }) })),
    },
    {
      key: 'grade' as const,
      scope: '학교' as FilterScope,
      label: `${filters.target_grade}학년`,
      active: filters.target_grade !== 1,
      icon: GraduationCap,
      options: [1, 2, 3, 4, 5, 6].map((value) => ({ label: `${value}학년`, selected: filters.target_grade === value, apply: () => apply({ target_grade: value }) })),
    },
    {
      key: 'students' as const,
      scope: '학교' as FilterScope,
      label: filters.min_students ? `${filters.min_students}명+` : '학생 수',
      active: filters.min_students > 0,
      icon: Users,
      options: [0, 40, 80, 120].map((value) => ({ label: value ? `${value}명 이상` : '제한 없음', selected: filters.min_students === value, apply: () => apply({ min_students: value }) })),
    },
    {
      key: 'households' as const,
      scope: '아파트' as FilterScope,
      label: filters.min_households ? `${filters.min_households.toLocaleString()}세대+` : '세대 수',
      active: filters.min_households > 0,
      icon: Building2,
      options: [0, 300, 500, 1000].map((value) => ({ label: value ? `${value.toLocaleString()}세대 이상` : '제한 없음', selected: filters.min_households === value, apply: () => apply({ min_households: value }) })),
    },
    {
      key: 'parking' as const,
      scope: '아파트' as FilterScope,
      label: filters.min_parking_ratio ? `주차 ${filters.min_parking_ratio}대+` : '주차',
      active: filters.min_parking_ratio > 0,
      icon: CarFront,
      options: [0, 0.8, 1, 1.2, 1.5].map((value) => ({ label: value ? `세대당 ${value}대 이상` : '제한 없음', selected: filters.min_parking_ratio === value, apply: () => apply({ min_parking_ratio: value }) })),
    },
  ]
  const activeItem = items.find((item) => item.key === openFilter)

  const toggleMenu = (key: FilterKey, button: HTMLButtonElement) => {
    if (openFilter === key) {
      setOpenFilter(null)
      return
    }
    const bounds = button.getBoundingClientRect()
    setMenuPosition({
      top: bounds.bottom + 6,
      left: Math.min(bounds.left, window.innerWidth - 166),
    })
    setOpenFilter(key)
  }

  return (
    <div ref={rootRef} className="quick-filter-shell">
      <div className="quick-filter-row" aria-label="빠른 필터">
        <button type="button" onClick={toggleSidebar} className="quick-filter-button quick-filter-button--all" aria-label="전체 필터 열기">
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
        {items.map(({ key, scope, label, active, icon: Icon }, index) => (
          <Fragment key={key}>
            {(index === 0 || items[index - 1].scope !== scope) && (
              <span className="flex-none px-1 text-[11px] font-bold text-gray-500">{scope}</span>
            )}
            <div className="relative flex-none">
              <button
                type="button"
                onClick={(event) => toggleMenu(key, event.currentTarget)}
                aria-expanded={openFilter === key}
                className={`quick-filter-button ${active ? 'quick-filter-button--active' : ''}`}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          </Fragment>
        ))}
      </div>
      {activeItem && createPortal(
        <div
          ref={menuRef}
          className="quick-filter-menu"
          style={menuPosition}
          role="menu"
          aria-label={`${activeItem.label} 선택`}
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
