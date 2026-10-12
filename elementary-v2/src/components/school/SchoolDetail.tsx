import { ChevronRight, ExternalLink, Globe, LayoutGrid, LoaderCircle, MapPin, RefreshCw, Star, UserRound, Users } from 'lucide-react'
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
import ShareButton from '../ui/ShareButton'
import DataFreshness from '../ui/DataFreshness'
import StartModule from '../content/StartModule'
import SchoolDayEstimateCard from './SchoolDayEstimateCard'
import SocialLinks from '../content/SocialLinks'
import NearbySchools from './NearbySchools'
import CareCenterList from '../care/CareCenterList'
import { markEntry, track } from '../../utils/analytics'
import { schoolPath } from '../../utils/urlState'
import { hasAcademyData } from '../../utils/academyCoverage'
import { displaySchoolName } from '../../utils/schoolName'
import { MAP_TOPICS, type MapTopic } from '../../utils/mapTopics'
import DetailTabs from '../ui/DetailTabs'

interface SchoolDetailProps {
  school: School | null
  isOpen: boolean
  onClose: () => void
  /**
   * Opens another screen through the app: a guide from the start module, or a
   * neighbouring school or the district hub from the comparison.
   */
  onOpenGuide: (path: string) => void
}

type SchoolMetric = 'students' | 'classes' | 'perClass'

const SchoolDetail: React.FC<SchoolDetailProps> = ({ school, isOpen, onClose, onOpenGuide }) => {
  const { state, dispatch } = useAppContext()
  const apartments = useMemo(
    () => [...state.apartments].sort((a, b) => b.households - a.households || a.name.localeCompare(b.name, 'ko')),
    [state.apartments],
  )
  const selectedApartment = state.selectedApartment
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const topicViews = { school: 'school', care: 'care', assignment: 'apartments', activity: 'education' } as const
  const currentView = selectedApartment ? 'apartment-detail' : topicViews[state.mapTopic]
  const setCurrentView = (view: 'school' | 'care' | 'apartments' | 'education') => {
    const topic = ({ school: 'school', care: 'care', apartments: 'assignment', education: 'activity' } as const)[view]
    dispatch({ type: 'SET_MAP_TOPIC', payload: topic })
  }
  const [selectedMetric, setSelectedMetric] = useState<SchoolMetric>('students')
  const [sheetSnap, setSheetSnap] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [academySummaries, setAcademySummaries] = useState<Record<string, ApartmentAcademySummary>>({})
  const [schoolAcademies, setSchoolAcademies] = useState<AcademyAddress[]>([])
  const [academyLoading, setAcademyLoading] = useState(false)
  const [academyError, setAcademyError] = useState<string | null>(null)
  const [academyLoaded, setAcademyLoaded] = useState(false)
  const academyDataAvailable = hasAcademyData(school?.region)
  // 통학구역으로 배정되는 학교는 공립 초등학교뿐이다. 국립·사립 초등학교는
  // 지원 입학이라 배정 단지가 없다 — 표본 대조에서 공립은 25개 중 22개가
  // 배정 단지를 갖는 반면 국립은 17개 중 1개, 사립은 25개 중 1개였다.
  // 서울교육대학교부설초등학교는 국립, 중앙대학교사범대학부속초등학교는 사립이다.
  // 학교알리미·NEIS의 홈페이지 주소. http(s)가 아닌 값(빈 문자열, 'http://' 같은 자리 표시)은 링크로 만들지 않는다.
  const homepage = (() => {
    const raw = school?.homepage?.trim()
    if (!raw) return null
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
    try {
      const url = new URL(withScheme)
      return url.hostname.includes('.') ? url.toString() : null
    } catch {
      return null
    }
  })()
  const assignsByZone = school?.establishment_type === '공립'
    && school.school_type === '초등학교'
  const hasSchoolInformation = Boolean(school?.student_data_status)

  useEffect(() => {
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
    if (!assignsByZone || !hasSchoolInformation || currentView !== 'education' || !school?.school_id || academyLoaded || !academyDataAvailable) return
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
  }, [academyDataAvailable, academyLoaded, assignsByZone, currentView, hasSchoolInformation, school?.school_id])

  useEffect(() => {
    if (!isOpen || !school?.school_id || !assignsByZone || !hasSchoolInformation) {
      dispatch({ type: 'SET_APARTMENTS', payload: [] })
      setAcademySummaries({})
      setLoading(false)
      setError(null)
      return
    }
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
  }, [assignsByZone, dispatch, hasSchoolInformation, isOpen, requestVersion, school?.school_id, state.filters])

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
  const title = displaySchoolName(school.school_name, school.region, school.establishment_type)

  // 아파트 선택은 여기서 비우지 않는다. 닫기가 뒤로 가기로 처리될 때 먼저 비우면
  // 주소 동기화가 학교 주소를 새로 쌓는다. 학교 선택을 비우면 아파트도 함께 비워진다.
  const close = () => {
    onClose()
  }

  const toggleFavorite = () => {
    const saved = toggleSavedFavorite(schoolFavorite(school))
    if (saved) track('save_candidate', { item_type: 'school', item_id: school.school_id })
    setIsFavorite(saved)
  }

  if (currentView === 'apartment-detail' && assignsByZone && hasSchoolInformation) {
    return (
      <ApartmentDetail
        apartment={selectedApartment}
        isOpen={isOpen && !state.selectedMapPlace}
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
      isOpen={isOpen && !state.selectedMapPlace}
      onClose={close}
      title={title}
      headerAction={(
        <span className="flex items-center">
          <ShareButton
            path={school ? schoolPath(school) : null}
            title={`${school?.school_name ?? ''} 배정 아파트`}
            text={school ? `${school.region} ${school.district ?? ''} ${school.school_name}에 배정되는 아파트를 확인하세요.` : undefined}
          />
          <button
            type="button"
            onClick={toggleFavorite}
            aria-label={isFavorite ? 'MY에서 빼기' : 'MY에 저장'}
            aria-pressed={isFavorite}
            className={`rounded-md p-2 transition-colors hover:bg-gray-100 ${isFavorite ? 'text-amber-500' : 'text-gray-500'}`}
          >
            <Star size={21} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </span>
      )}
      snapPoints={[0.11, 0.38, 0.68, 0.88]}
      defaultSnap={1}
      swipeDownBehavior="minimize"
      onSnapChange={setSheetSnap}
    >
      {sheetSnap !== 0 && (
        <div className="px-4 pt-3">
          <DetailTabs<MapTopic> label="학교 상세 메뉴" tabs={MAP_TOPICS} value={state.mapTopic}
            onChange={(topic) => dispatch({ type: 'SET_MAP_TOPIC', payload: topic })} />
        </div>
      )}
      {sheetSnap === 0 ? null : currentView === 'apartments' ? (
        <div className="mx-auto h-full w-full max-w-4xl">
          <p className="px-4 py-3 text-xs text-gray-600">{assignsByZone ? '배정 아파트 · 통학구역 경계와 실제 배정은 교육지원청에 확인하세요.' : `${school.establishment_type} 학교는 지원 입학으로 통학구역 배정이 없습니다.`}</p>
          <ApartmentList
            apartments={apartments}
            loading={loading}
            error={error}
            academySummaries={academySummaries}
            onRetry={() => setRequestVersion((value) => value + 1)}
            onApartmentSelect={(apartment) => {
              markEntry('related')
              dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
            }}
          />
        </div>
      ) : currentView === 'education' ? (
        <div className="mx-auto h-full w-full max-w-4xl overflow-auto px-4 py-3">
          <h3 className="mb-2 font-semibold">주변 배움·활동</h3>
          <p className="mb-3 text-xs text-gray-500">배정 아파트 생활권의 학원·교습소·체육도장 분야 정보입니다. 초등학생 대상 강좌와 모집 여부는 각 기관에 확인하세요.</p>
          {(!assignsByZone || !hasSchoolInformation) && <p className="mb-3 text-xs text-gray-500">통학구역 배정 또는 학교 공시 정보가 확인되지 않아 이 학교의 생활권 시설 집계는 제공하지 않습니다. 주변 시설이 없다는 뜻은 아닙니다.</p>}
          <AcademySummaryPanel
            academies={schoolAcademies}
            loading={academyLoading}
            error={academyError}
            dataAvailable={academyDataAvailable && assignsByZone && hasSchoolInformation}
            onShowMap={() => window.dispatchEvent(new CustomEvent('joinmap:show-school-academies'))}
          />
          <DataFreshness sources={['neis-academy']} />
        </div>
      ) : currentView === 'care' ? (
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-3">
          <SchoolDayEstimateCard school={school} onOpenGuide={onOpenGuide} />
          <CareCenterList latitude={school.latitude} longitude={school.longitude} origin={{ type: 'school', id: school.school_id }} headingId="school-care-centers-title" />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-3">
          <section>
            {!assignsByZone && (
              <span className="mb-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {school.establishment_type} · 통학구역 배정 없음
              </span>
            )}
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="mt-0.5 flex-none" size={16} aria-hidden="true" />
              <span>{school.address || `${school.city || ''} ${school.district || ''}`}</span>
            </div>
            {homepage && (
              // 공지사항·가정통신문은 학교 홈페이지가 원본이다. 서울 학교 홈페이지(sen.es.kr)는 robots.txt가
              // 첫 화면 밖의 수집을 막으므로 내용을 가져오지 않고 링크로 보낸다(2026-10-10).
              <a
                href={homepage}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('open_school_homepage', { school_id: school.school_id })}
                className="mt-1.5 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
              >
                <Globe className="flex-none" size={16} aria-hidden="true" />
                학교 홈페이지 <span className="text-xs font-normal text-gray-500">공지사항·가정통신문</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
            {school.student_statistics_year && (
              <p className="mt-1 text-xs text-gray-500">{school.student_statistics_year}년 학생 통계</p>
            )}
          </section>

          {!hasSchoolInformation ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-5 text-center text-sm font-medium text-amber-900" role="status">
              공공데이터 부재. 추가 확인 필요
            </p>
          ) : (
            <>

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

          <StartModule school={school} onOpenGuide={onOpenGuide} />
          <SocialLinks targetType="school" targetKey={school.school_id} compact />

          <button type="button" onClick={() => setCurrentView('care')} className="w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-left text-sm font-semibold text-rose-900">초1 하루·방과후·돌봄 보기 <ChevronRight size={15} className="inline" aria-hidden="true" /></button>

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

          <NearbySchools school={school} onNavigate={onOpenGuide} />

          {assignsByZone && <section aria-labelledby="apartments-title">
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
                      onClick={() => {
                        markEntry('related')
                        dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>}

          <DataFreshness sources={['schoolinfo-grade-students', 'kapt-basic']} />
            </>
          )}

        </div>
      )}
    </BottomSheet>
  )
}

export default SchoolDetail
