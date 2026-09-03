import { Building2, Clock3, LoaderCircle, Search, School as SchoolIcon, X } from 'lucide-react'
import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { School, SearchResult } from '../../types'
import { getSchoolDetail, searchMapEntities } from '../../services/dataService'
import { useAppContext } from '../../contexts/AppContext'

interface SearchBoxProps {
  onSchoolSelect?: (school: School) => void
  placeholder?: string
  className?: string
}

const HISTORY_KEY = 'map-search-history-v2'

const SearchBox: React.FC<SearchBoxProps> = ({
  onSchoolSelect,
  placeholder = '학교명 또는 아파트명 검색',
  className = '',
}) => {
  const { dispatch } = useAppContext()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchHistory, setSearchHistory] = useState<SearchResult[]>([])
  const requestVersion = useRef(0)
  const skipNextSearch = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rawHistory = localStorage.getItem(HISTORY_KEY)
    if (!rawHistory) return
    try {
      const history = JSON.parse(rawHistory) as SearchResult[]
      setSearchHistory(history.filter((item) => item?.type && item?.id).slice(0, 8))
    } catch {
      localStorage.removeItem(HISTORY_KEY)
    }
  }, [])

  const saveToHistory = useCallback((result: SearchResult) => {
    setSearchHistory((previous) => {
      const next = [result, ...previous.filter((item) => item.type !== result.type || item.id !== result.id)].slice(0, 8)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  useEffect(() => {
    const version = ++requestVersion.current
    const term = query.trim()
    if (skipNextSearch.current) {
      skipNextSearch.current = false
      setIsLoading(false)
      return
    }
    if (term.length < 2) {
      setResults([])
      setError(null)
      setIsLoading(false)
      return
    }

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const searchResults = await searchMapEntities(term)
        if (requestVersion.current !== version) return
        setResults(searchResults)
        setSelectedIndex(-1)
      } catch (reason) {
        if (requestVersion.current !== version) return
        console.error('통합 검색 실패:', reason)
        setResults([])
        setError('검색 결과를 불러오지 못했습니다.')
      } finally {
        if (requestVersion.current === version) setIsLoading(false)
      }
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [query])

  const finishSelection = (result: SearchResult) => {
    skipNextSearch.current = result.name !== query
    setQuery(result.name)
    setIsOpen(false)
    setResults([])
    setSelectedIndex(-1)
    setError(null)
    saveToHistory(result)
  }

  const handleResultSelect = async (result: SearchResult) => {
    if (result.type === 'school' && result.school) {
      const school = result.school
      if (school.latitude && school.longitude) {
        dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: school.latitude, lng: school.longitude }, zoom: 14 } })
      }
      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: school })
      onSchoolSelect?.(school)
      finishSelection(result)
      return
    }

    if (result.type === 'apartment' && result.apartment) {
      setIsLoading(true)
      setError(null)
      try {
        const school = await getSchoolDetail(result.apartment.assigned_school_id)
        if (!school) throw new Error('Assigned school not found')
        dispatch({
          type: 'SET_MAP_STATE',
          payload: { center: { lat: result.apartment.latitude, lng: result.apartment.longitude }, zoom: 14 },
        })
        dispatch({ type: 'OPEN_SEARCHED_APARTMENT', payload: { school, apartment: result.apartment } })
        finishSelection(result)
      } catch (reason) {
        console.error('아파트 검색 결과 열기 실패:', reason)
        setError('아파트 상세 정보를 열지 못했습니다.')
      } finally {
        setIsLoading(false)
      }
    }
  }

  const displayResults = query.trim().length >= 2 ? results : searchHistory

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => Math.min(index + 1, displayResults.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => Math.max(index - 1, -1))
    } else if (event.key === 'Enter' && selectedIndex >= 0 && displayResults[selectedIndex]) {
      event.preventDefault()
      void handleResultSelect(displayResults[selectedIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
      setSelectedIndex(-1)
      inputRef.current?.blur()
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const highlightMatch = (text: string) => {
    const term = query.trim()
    if (!term) return text
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return parts.map((part, index) => (
      part.toLocaleLowerCase() === term.toLocaleLowerCase()
        ? <mark key={index} className="bg-amber-100 text-gray-950">{part}</mark>
        : part
    ))
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="text-gray-500" size={20} aria-hidden="true" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIsOpen(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          aria-label="학교명 또는 아파트명 검색"
          aria-expanded={isOpen}
          aria-controls="map-search-results"
          aria-autocomplete="list"
          role="combobox"
          placeholder={placeholder}
          className="mobile-input block h-12 w-full rounded-2xl border border-white/80 bg-white pl-11 pr-11 text-base leading-5 text-gray-950 shadow-[0_3px_14px_rgba(32,33,36,0.2)] outline-none placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              requestVersion.current += 1
              setQuery('')
              setResults([])
              setError(null)
              setIsOpen(true)
              inputRef.current?.focus()
            }}
            className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-full text-gray-500 hover:text-gray-800"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {isOpen && (
        <div id="map-search-results" role="listbox" className="absolute z-40 mt-2 max-h-[min(64vh,440px)] w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              <LoaderCircle className="mx-auto mb-2 animate-spin text-blue-600" size={22} aria-hidden="true" />
              검색 중...
            </div>
          ) : error ? (
            <div className="p-4 text-center text-sm text-red-700" role="alert">{error}</div>
          ) : displayResults.length > 0 ? (
            displayResults.map((result, index) => {
              const previousType = displayResults[index - 1]?.type
              const showTypeHeader = query.trim().length >= 2 && previousType !== result.type
              const Icon = result.type === 'school' ? SchoolIcon : Building2
              return (
                <Fragment key={`${result.type}-${result.id}`}>
                  {showTypeHeader && (
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
                      {result.type === 'school' ? '학교' : '아파트'}
                    </div>
                  )}
                  {query.trim().length < 2 && index === 0 && (
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">최근 검색</div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === index}
                    onClick={() => void handleResultSelect(result)}
                    className={`flex w-full items-center border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 ${selectedIndex === index ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`mr-3 flex h-9 w-9 flex-none items-center justify-center rounded-full ${result.type === 'school' ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700'}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-950">{query.trim().length >= 2 ? highlightMatch(result.name) : result.name}</span>
                      <span className="block truncate text-sm text-gray-500">{result.address}</span>
                      <span className="mt-1 block text-xs text-gray-500">
                        {result.type === 'school'
                          ? `${result.school?.establishment_type || '초등학교'} · 1학년 ${result.school?.grade1_students || 0}명`
                          : `${result.apartment?.households.toLocaleString() || 0}세대 · ${result.apartment?.assigned_school_name || '배정학교 확인 중'}${(result.assigned_schools?.length || 0) > 1 ? ` 외 ${(result.assigned_schools?.length || 1) - 1}곳` : ''}`}
                      </span>
                    </span>
                    {query.trim().length < 2 && <Clock3 className="ml-2 flex-none text-gray-400" size={16} aria-hidden="true" />}
                  </button>
                </Fragment>
              )
            })
          ) : query.trim().length >= 2 ? (
            <div className="p-4 text-center text-gray-500">
              <Search className="mx-auto mb-2 text-gray-300" size={30} aria-hidden="true" />
              <div className="text-sm">검색 결과가 없습니다.</div>
              <div className="mt-1 text-xs">학교명이나 아파트명을 다시 확인해주세요.</div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <Search className="mx-auto mb-2 text-gray-300" size={30} aria-hidden="true" />
              <div className="text-sm">학교명 또는 아파트명을 입력하세요.</div>
              <div className="mt-1 text-xs">최소 2글자 이상 입력해주세요.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBox
