import { ArrowLeft, ChevronRight, GraduationCap, LayoutGrid, LoaderCircle, MapPin, RefreshCw, Star, UserRound, Users } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { School } from '../../types'
import { useAppContext } from '../../contexts/AppContext'
import { getAcademiesNearSchool, getApartmentAcademySummaries, getApartmentsNearSchool } from '../../services/dataService'
import BottomSheet from '../ui/BottomSheet'
import ApartmentList from '../apartment/ApartmentList'
import ApartmentDetail from '../apartment/ApartmentDetail'
import ApartmentCard from '../apartment/ApartmentCard'
import AcademySummaryPanel from '../academy/AcademySummaryPanel'
import GradeChart from '../charts/GradeChart'
import { isFavorite as checkFavorite, schoolFavorite, toggleFavorite as toggleSavedFavorite } from '../../utils/favorites'
import { recordPerformanceMetric } from '../../utils/performanceMetrics'
import type { AcademyAddress, ApartmentAcademySummary } from '../../types'

interface SchoolDetailProps {
  school: School | null
  isOpen: boolean
  onClose: () => void
}

type SchoolMetric = 'students' | 'classes' | 'perClass'

const SchoolDetail: React.FC<SchoolDetailProps> = ({ school, isOpen, onClose }) => {
  const { state, dispatch } = useAppContext()
  const apartments = useMemo(
    () => [...state.apartments].sort((a, b) => b.households - a.households || a.name.localeCompare(b.name, 'ko')),
    [state.apartments],
  )
  const selectedApartment = state.selectedApartment
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<'school' | 'apartments' | 'education' | 'apartment-detail'>('school')
  const [selectedMetric, setSelectedMetric] = useState<SchoolMetric>('students')
  const [sheetSnap, setSheetSnap] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [academySummaries, setAcademySummaries] = useState<Record<string, ApartmentAcademySummary>>({})
  const [schoolAcademies, setSchoolAcademies] = useState<AcademyAddress[]>([])
  const [academyLoading, setAcademyLoading] = useState(false)
  const [academyError, setAcademyError] = useState<string | null>(null)
  const [academyLoaded, setAcademyLoaded] = useState(false)

  useEffect(() => {
    setCurrentView('school')
    setSelectedMetric('students')
    setSheetSnap(1)
    setSchoolAcademies([])
    setAcademyError(null)
    setAcademyLoaded(false)
  }, [school?.school_id])

  useEffect(() => {
    if (!school?.school_id) return
    setIsFavorite(checkFavorite('school', school.school_id))
  }, [school?.school_id])

  useEffect(() => {
    if (selectedApartment) setCurrentView('apartment-detail')
  }, [selectedApartment])

  useEffect(() => {
    if (currentView !== 'education' || !school?.school_id || academyLoaded) return
    let active = true
    setAcademyLoading(true)
    setAcademyError(null)
    getAcademiesNearSchool(school.school_id)
      .then((rows) => { if (active) setSchoolAcademies(rows) })
      .catch((reason) => {
        console.error('학교 생활권 학원 조회 실패:', reason)
        if (active) setAcademyError('주변 교육환경을 불러오지 못했습니다. SQL 15 적용 여부를 확인해 주세요.')
      })
      .finally(() => {
        if (active) {
          setAcademyLoading(false)
          setAcademyLoaded(true)
        }
      })
    return () => { active = false }
  }, [academyLoaded, currentView, school?.school_id])

  useEffect(() => {
    if (!isOpen || !school?.school_id) return
    let active = true
    setLoading(true)
    setError(null)
    dispatch({ type: 'SET_APARTMENTS', payload: [] })
    setAcademySummaries({})
    const startedAt = performance.now()
    getApartmentsNearSchool(school.school_id, state.filters)
      .then(async (data) => {
        if (active) {
          dispatch({ type: 'SET_APARTMENTS', payload: data })
          recordPerformanceMetric('school-apartment-load', startedAt, 'success', {
            schoolId: school.school_id,
            resultCount: data.length,
          })
          try {
            const summaries = await getApartmentAcademySummaries(data.map((apartment) => apartment.id))
            if (active) setAcademySummaries(summaries)
          } catch (summaryError) {
            console.error('학원 요약 조회 실패:', summaryError)
          }
        }
      })
      .catch((reason) => {
        if (!active) return
        console.error('배정 아파트 조회 실패:', reason)
        dispatch({ type: 'SET_APARTMENTS', payload: [] })
        setError('배정 아파트 정보를 불러오지 못했습니다.')
        recordPerformanceMetric('school-apartment-load', startedAt, 'error', {
          schoolId: school.school_id,
        })
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [dispatch, isOpen, requestVersion, school?.school_id, state.filters])

  const gradeData = useMemo(() => {
    if (!school) return []
    return Array.from({ length: 6 }, (_, index) => {
      const grade = index + 1
      const students = Number(school[`grade${grade}_students` as keyof School]) || 0
      const classes = Number(school[`grade${grade}_classes` as keyof School]) || 0
      return { grade, students, classes, perClass: classes ? Math.round(students / classes) : 0 }
    })
  }, [school])

  if (!school) return null

  const firstGradeClasses = school.grade1_classes || 0
  const firstGradePerClass = school.grade1_per_class
    || (firstGradeClasses ? Math.round(school.grade1_students / firstGradeClasses) : 0)
  const title = currentView === 'apartments'
    ? '배정 아파트'
    : currentView === 'education'
      ? '주변 교육환경'
    : currentView === 'apartment-detail'
      ? selectedApartment?.name
      : school.school_name

  const close = () => {
    setCurrentView('school')
    dispatch({ type: 'SET_SELECTED_APARTMENT', payload: null })
    onClose()
  }

  const toggleFavorite = () => {
    setIsFavorite(toggleSavedFavorite(schoolFavorite(school)))
  }

  if (currentView === 'apartment-detail') {
    return (
      <ApartmentDetail
        apartment={selectedApartment}
        isOpen={isOpen}
        onClose={close}
        onBack={() => {
          dispatch({ type: 'SET_SELECTED_APARTMENT', payload: null })
          setCurrentView('apartments')
        }}
      />
    )
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={close}
      title={title}
      headerAction={currentView === 'school' ? (
        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          aria-pressed={isFavorite}
          className={`rounded-md p-2 transition-colors hover:bg-gray-100 ${isFavorite ? 'text-amber-500' : 'text-gray-500'}`}
        >
          <Star size={21} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      ) : undefined}
      snapPoints={[0.11, 0.38, 0.68, 0.88]}
      defaultSnap={1}
      swipeDownBehavior="minimize"
      onSnapChange={setSheetSnap}
    >
      {sheetSnap === 0 ? null : currentView === 'apartments' ? (
        <div className="mx-auto h-full w-full max-w-4xl">
          <div className="border-b border-gray-200 px-4 py-2">
            <button type="button" onClick={() => setCurrentView('school')} className="inline-flex items-center gap-1 py-2 text-sm font-medium text-blue-700 hover:text-blue-900">
              <ArrowLeft size={16} aria-hidden="true" />
              학교 정보
            </button>
          </div>
          <ApartmentList
            apartments={apartments}
            loading={loading}
            error={error}
            academySummaries={academySummaries}
            onRetry={() => setRequestVersion((value) => value + 1)}
            onApartmentSelect={(apartment) => {
              dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
            }}
          />
        </div>
      ) : currentView === 'education' ? (
        <div className="mx-auto h-full w-full max-w-4xl overflow-auto px-4 py-3">
          <button type="button" onClick={() => setCurrentView('school')} className="mb-3 inline-flex items-center gap-1 py-1 text-sm font-medium text-blue-700 hover:text-blue-900">
            <ArrowLeft size={16} aria-hidden="true" />학교 정보
          </button>
          <AcademySummaryPanel
            academies={schoolAcademies}
            loading={academyLoading}
            error={academyError}
            onShowMap={() => window.dispatchEvent(new CustomEvent('joinmap:show-school-academies'))}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-3">
          <nav className="grid grid-cols-3 gap-1 rounded-md bg-gray-100 p-1" aria-label="학교 상세 메뉴">
            <button type="button" className="rounded bg-white px-2 py-2 text-xs font-semibold text-gray-950 shadow-sm" aria-current="page">학교 현황</button>
            <button type="button" onClick={() => setCurrentView('apartments')} className="rounded px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-white">배정 아파트 {apartments.length}</button>
            <button type="button" onClick={() => setCurrentView('education')} className="inline-flex items-center justify-center gap-1 rounded px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-white"><GraduationCap size={14} aria-hidden="true" />교육환경</button>
          </nav>
          <section>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="mt-0.5 flex-none" size={16} aria-hidden="true" />
              <span>{school.address || `${school.city || ''} ${school.district || ''}`}</span>
            </div>
            {school.student_statistics_year && (
              <p className="mt-1 text-xs text-gray-500">{school.student_statistics_year}년 학생 통계</p>
            )}
          </section>

          <section aria-labelledby="first-grade-title">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 id="first-grade-title" className="font-semibold text-gray-950">1학년 현황</h3>
            </div>
            <div className="grid grid-cols-3 gap-2" aria-label="학교 통계 지표">
              {([
                ['students', '학생수', school.grade1_students, '명', Users],
                ['classes', '학급수', firstGradeClasses, '학급', LayoutGrid],
                ['perClass', '학급당', firstGradePerClass, '명', UserRound],
              ] as const).map(([metric, label, value, unit, Icon]) => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => setSelectedMetric(metric)}
                  aria-pressed={selectedMetric === metric}
                  className={`flex min-h-[68px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors ${selectedMetric === metric ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  <Icon size={15} className="mb-0.5" aria-hidden="true" />
                  <strong className="text-lg leading-none">{value.toLocaleString()}</strong>
                  <span className="mt-1 text-[11px] font-medium">{label} · {unit}</span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="grade-title">
            <h3 id="grade-title" className="mb-2 font-semibold text-gray-950">학년별 학생 현황</h3>
            <GradeChart school={school} metric={selectedMetric} />
            <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-6">
              {gradeData.map(({ grade, students, classes, perClass }) => (
                <div key={grade} className="bg-white px-2 py-2 text-center">
                  <strong className="text-sm text-gray-950">{grade}학년</strong>
                  <span className="mt-1 block text-sm font-semibold text-blue-700">{students}명</span>
                  <span className="block text-xs text-gray-500">{classes}학급 · {perClass}명</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="apartments-title">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="apartments-title" className="font-semibold text-gray-950">주요 배정 아파트</h3>
              {loading ? (
                <LoaderCircle className="animate-spin text-blue-600" size={18} aria-label="배정 아파트 불러오는 중" />
              ) : (
                <button type="button" onClick={() => setCurrentView('apartments')} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
                  전체 {apartments.length}개
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {error ? (
              <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3" role="alert">
                <p className="min-w-0 flex-1 text-sm text-amber-900">배정 아파트 정보를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => setRequestVersion((value) => value + 1)} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700">
                  <RefreshCw size={15} aria-hidden="true" />
                  다시 시도
                </button>
              </div>
            ) : apartments.length === 0 && !loading ? (
              <p className="border-y border-gray-100 py-4 text-sm text-gray-500">현재 조건에 표시할 배정 단지가 없습니다.</p>
            ) : (
              <div className="border-y border-gray-200">
                <div className="space-y-2 py-2">
                  {apartments.slice(0, 3).map((apartment) => (
                    <ApartmentCard
                      key={apartment.id}
                      apartment={apartment}
                      academySummary={academySummaries[apartment.id]}
                      compact
                      onClick={() => dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      )}
    </BottomSheet>
  )
}

export default SchoolDetail
