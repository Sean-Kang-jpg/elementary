import { ArrowLeft, Building2, CarFront, ChevronRight, LoaderCircle, MapPin } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { School } from '../../types'
import { useAppContext } from '../../contexts/AppContext'
import { getApartmentsNearSchool } from '../../services/dataService'
import BottomSheet from '../ui/BottomSheet'
import ApartmentList from '../apartment/ApartmentList'
import ApartmentDetail from '../apartment/ApartmentDetail'
import GradeChart from '../charts/GradeChart'

interface SchoolDetailProps {
  school: School | null
  isOpen: boolean
  onClose: () => void
}

const SchoolDetail: React.FC<SchoolDetailProps> = ({ school, isOpen, onClose }) => {
  const { state, dispatch } = useAppContext()
  const apartments = useMemo(
    () => [...state.apartments].sort((a, b) => b.households - a.households || a.name.localeCompare(b.name, 'ko')),
    [state.apartments],
  )
  const selectedApartment = state.selectedApartment
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<'school' | 'apartments' | 'apartment-detail'>('school')

  useEffect(() => {
    setCurrentView('school')
    dispatch({ type: 'SET_SELECTED_APARTMENT', payload: null })
  }, [dispatch, school?.school_id])

  useEffect(() => {
    if (selectedApartment) setCurrentView('apartment-detail')
  }, [selectedApartment])

  useEffect(() => {
    if (!isOpen || !school?.school_id) return
    let active = true
    setLoading(true)
    setError(null)
    dispatch({ type: 'SET_APARTMENTS', payload: [] })
    getApartmentsNearSchool(school.school_id, state.filters)
      .then((data) => {
        if (active) dispatch({ type: 'SET_APARTMENTS', payload: data })
      })
      .catch((reason) => {
        if (!active) return
        console.error('배정 아파트 조회 실패:', reason)
        dispatch({ type: 'SET_APARTMENTS', payload: [] })
        setError('배정 아파트 정보를 불러오지 못했습니다.')
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [dispatch, isOpen, school?.school_id, state.filters])

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
    : currentView === 'apartment-detail'
      ? selectedApartment?.name
      : school.school_name

  const close = () => {
    setCurrentView('school')
    dispatch({ type: 'SET_SELECTED_APARTMENT', payload: null })
    onClose()
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
      snapPoints={[0.45, 0.7]}
      defaultSnap={0}
    >
      {currentView === 'apartments' ? (
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
            onApartmentSelect={(apartment) => {
              dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
            }}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-5">
          <section>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="mt-0.5 flex-none" size={16} aria-hidden="true" />
              <span>{school.address || `${school.city || ''} ${school.district || ''}`}</span>
            </div>
            {school.student_statistics_year && (
              <p className="mt-2 text-xs text-gray-500">{school.student_statistics_year}년 학생 통계</p>
            )}
          </section>

          <section aria-labelledby="first-grade-title">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 id="first-grade-title" className="font-semibold text-gray-950">1학년 현황</h3>
              <span className="text-xs text-gray-500">입학 규모를 보는 핵심 지표</span>
            </div>
            <div className="grid grid-cols-3 border-y border-gray-200 py-4 text-center">
              <div className="border-r border-gray-200">
                <strong className="block text-2xl text-blue-700">{school.grade1_students.toLocaleString()}</strong>
                <span className="text-xs text-gray-500">학생 수</span>
              </div>
              <div className="border-r border-gray-200">
                <strong className="block text-2xl text-gray-950">{firstGradeClasses}</strong>
                <span className="text-xs text-gray-500">학급 수</span>
              </div>
              <div>
                <strong className="block text-2xl text-gray-950">{firstGradePerClass}</strong>
                <span className="text-xs text-gray-500">학급당 학생</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="grade-title">
            <h3 id="grade-title" className="mb-3 font-semibold text-gray-950">학년별 학생 현황</h3>
            <GradeChart school={school} />
            <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-6">
              {gradeData.map(({ grade, students, classes, perClass }) => (
                <div key={grade} className="bg-white px-2 py-3 text-center">
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
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
            ) : apartments.length === 0 && !loading ? (
              <p className="border-y border-gray-100 py-4 text-sm text-gray-500">현재 조건에 표시할 배정 단지가 없습니다.</p>
            ) : (
              <div className="border-y border-gray-200">
                {apartments.slice(0, 3).map((apartment) => (
                  <button
                    key={apartment.id}
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
                    }}
                    className="flex w-full items-center gap-3 border-b border-gray-100 py-3 text-left last:border-b-0 hover:bg-gray-50"
                  >
                    <Building2 className="flex-none text-gray-400" size={19} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{apartment.name}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        <span>{apartment.households.toLocaleString()}세대</span>
                        <span>{apartment.built_year ? `${apartment.built_year}년` : '준공연도 미확인'}</span>
                        <span className="inline-flex items-center gap-1"><CarFront size={12} aria-hidden="true" />지상 {apartment.ground_parking.toLocaleString()}대 · 지하 {apartment.underground_parking.toLocaleString()}대</span>
                        <span>세대당 {apartment.parking_per_household.toFixed(1)}대</span>
                      </span>
                    </span>
                    <ChevronRight className="flex-none text-gray-400" size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

        </div>
      )}
    </BottomSheet>
  )
}

export default SchoolDetail
