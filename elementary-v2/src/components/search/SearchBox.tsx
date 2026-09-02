/**
 * 검색 박스 컴포넌트
 * 학교명/주소 자동완성 검색 기능
 */

import { Clock3, LoaderCircle, Search, School as SchoolIcon, X } from 'lucide-react'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { School } from '../../types'
import { searchSchoolsByName } from '../../services/dataService'
import { useAppContext } from '../../contexts/AppContext'

interface SearchBoxProps {
  onSchoolSelect?: (school: School) => void
  placeholder?: string
  className?: string
}

const SearchBox: React.FC<SearchBoxProps> = ({
  onSchoolSelect,
  placeholder = "학교명 또는 주소로 검색...",
  className = ""
}) => {
  const { dispatch } = useAppContext()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<School[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchHistory, setSearchHistory] = useState<School[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // 검색 히스토리 로드
  useEffect(() => {
    const history = localStorage.getItem('school-search-history')
    if (history) {
      try {
        setSearchHistory(JSON.parse(history))
      } catch (error) {
        console.error('검색 히스토리 로드 실패:', error)
      }
    }
  }, [])

  // 검색 히스토리 저장
  const saveToHistory = useCallback((school: School) => {
    const newHistory = [school, ...searchHistory.filter(s => s.school_id !== school.school_id)].slice(0, 10)
    setSearchHistory(newHistory)
    localStorage.setItem('school-search-history', JSON.stringify(newHistory))
  }, [searchHistory])

  // 디바운스된 검색
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true)
        try {
          const searchResults = await searchSchoolsByName(query.trim())
          setResults(searchResults)
          setSelectedIndex(-1)
        } catch (error) {
          console.error('검색 실패:', error)
          setResults([])
        } finally {
          setIsLoading(false)
        }
      } else {
        setResults([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query])

  // 학교 선택 핸들러
  const handleSchoolSelect = (school: School) => {
    setQuery(school.school_name)
    setIsOpen(false)
    setResults([])
    setSelectedIndex(-1)
    saveToHistory(school)

    // 지도 중심점 이동
    if (school.latitude && school.longitude) {
      dispatch({
        type: 'SET_MAP_STATE',
        payload: {
          center: {
            lat: school.latitude,
            lng: school.longitude
          },
          zoom: 14
        }
      })
    }

    // 학교 선택
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: school
    })

    onSchoolSelect?.(school)
  }

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentResults = query.trim().length >= 2 ? results : searchHistory

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < currentResults.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && currentResults[selectedIndex]) {
          handleSchoolSelect(currentResults[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 검색 결과 하이라이팅
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text

    const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedQuery})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-gray-900">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  // 표시할 결과 목록
  const displayResults = query.trim().length >= 2 ? results : searchHistory

  return (
    <div ref={resultsRef} className={`relative ${className}`}>
      {/* 검색 입력 */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="text-gray-500" size={20} aria-hidden="true" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          aria-label="학교명 또는 주소 검색"
          aria-expanded={isOpen}
          aria-controls="school-search-results"
          role="combobox"
          placeholder={placeholder}
          className="mobile-input block h-12 w-full rounded-2xl border border-white/80 bg-white pl-11 pr-11 text-base leading-5 text-gray-950 shadow-[0_3px_14px_rgba(32,33,36,0.2)] outline-none placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setQuery('')
              setResults([])
              setIsOpen(false)
              inputRef.current?.focus()
            }}
            className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-full text-gray-500 hover:text-gray-800"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {isOpen && (
        <div id="school-search-results" className="absolute mt-2 max-h-[min(60vh,420px)] w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="p-4 text-center">
              <LoaderCircle className="mx-auto animate-spin text-blue-600" size={22} aria-hidden="true" />
              <div className="mt-2 text-sm text-gray-500">검색 중...</div>
            </div>
          ) : displayResults.length > 0 ? (
            <>
              {/* 검색 히스토리 헤더 */}
              {query.trim().length < 2 && searchHistory.length > 0 && (
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  최근 검색
                </div>
              )}

              {/* 검색 결과 목록 */}
              {displayResults.map((school, index) => (
                <button
                  key={school.school_id}
                  onClick={() => handleSchoolSelect(school)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                    selectedIndex === index ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                  <span className="mr-3 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-700"><SchoolIcon size={18} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">
                        {query.trim().length >= 2
                          ? highlightMatch(school.school_name, query)
                          : school.school_name
                        }
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {query.trim().length >= 2
                          ? highlightMatch(school.address || '', query)
                          : school.address
                        }
                      </div>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className="text-xs text-gray-400">
                          {school.city} {school.district}
                        </span>
                        {school.grade1_students > 0 && (
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            school.grade1_students >= 80
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}>
                            1학년 {school.grade1_students}명
                          </span>
                        )}
                      </div>
                    </div>
                    {query.trim().length < 2 && (
                      <Clock3 className="ml-2 flex-none text-gray-400" size={16} aria-hidden="true" />
                    )}
                  </div>
                </button>
              ))}
            </>
          ) : query.trim().length >= 2 ? (
            <div className="p-4 text-center text-gray-500">
              <Search className="mx-auto mb-2 text-gray-300" size={30} aria-hidden="true" />
              <div className="text-sm">검색 결과가 없습니다.</div>
              <div className="text-xs mt-1">다른 키워드로 검색해보세요.</div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <Search className="mx-auto mb-2 text-gray-300" size={30} aria-hidden="true" />
              <div className="text-sm">학교명 또는 주소를 입력하세요.</div>
              <div className="text-xs mt-1">최소 2글자 이상 입력해주세요.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBox
