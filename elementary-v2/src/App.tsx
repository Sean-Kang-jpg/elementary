import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import FilterPanel from './components/filters/FilterPanel'
import MapContainer from './components/map/MapContainer'
import MapErrorBoundary from './components/map/MapErrorBoundary'
import SchoolDetail from './components/school/SchoolDetail'
import { useAppContext } from './contexts/AppContext'
import { testSupabaseConnection } from './lib/supabase'
import FavoritesPage from './components/navigation/FavoritesPage'
import HomePage from './components/navigation/HomePage'
import NewsPage from './components/navigation/NewsPage'
import PrivacyPage from './components/navigation/PrivacyPage'
import { getApartmentByPublicKey, getSchoolDetail } from './services/dataService'
import type { FavoriteRecord } from './utils/favorites'
import { initAnalytics, markEntry, takeEntry, track, trackPageView } from './utils/analytics'
import {
  apartmentPath,
  parseRoute,
  schoolPath,
  setCanonical,
  syncPath,
  VIEW_PATHS,
  viewOf,
  type AppView,
  type Route,
} from './utils/urlState'

interface ConnectionStatus {
  supabase: 'connecting' | 'success' | 'error'
  error?: string
}

function MapApplication() {
  const { state, dispatch } = useAppContext()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    supabase: 'connecting'
  })
  // 화면은 주소에서 나온다. 탭 상태를 따로 두면 주소와 화면이 갈라진다.
  const [view, setView] = useState<AppView>(() => viewOf(parseRoute(window.location.pathname, window.location.search)))
  // 지도는 처음 필요할 때 만들고, 그 뒤로는 다른 화면 아래에 둔 채 유지한다.
  // 지도 인스턴스와 마커는 React 바깥에서 관리되므로 다시 만드는 비용이 크다.
  const [mapMounted, setMapMounted] = useState(view === 'map')
  // 주소를 읽어 선택을 복원하는 동안에는 선택을 보고 주소를 쓰면 안 된다.
  // 그러지 않으면 복원 도중의 중간 상태가 기록으로 쌓인다.
  const restoring = useRef(false)
  // 뒤로·앞으로 가기로 되돌아온 상세는 새로 연 상세가 아니다. 상세 조회 이벤트를
  // 보내면 한 번 본 학교가 오갈 때마다 다시 집계된다. 시간 구간 플래그로는 안
  // 된다 — 복원이 끝난 뒤에야 React가 다시 그리므로 플래그가 먼저 풀린다. 그래서
  // 되돌아온 대상 자체를 기억했다가 그 선택만 건너뛴다.
  const historyTarget = useRef<string | null>(null)

  const applyRoute = useCallback(async (route: Route) => {
    restoring.current = true
    try {
      // 상세가 아닌 주소는 선택이 없는 상태다. admin은 App이 따로 분기하므로
      // 여기까지 오지 않는다.
      if (route.kind !== 'school' && route.kind !== 'apartment') {
        dispatch({ type: 'SET_SELECTED_APARTMENT', payload: null })
        dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
        return
      }
      if (route.kind === 'school') {
        const school = await getSchoolDetail(route.key)
        if (!school) return
        dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: school.latitude, lng: school.longitude }, zoom: 14 } })
        dispatch({ type: 'SET_SELECTED_SCHOOL', payload: school })
        return
      }
      const found = await getApartmentByPublicKey(route.key)
      if (!found) return
      // 대표 배정 학교를 함께 연다. 아파트만 띄우면 이 제품이 답하는 질문,
      // "어느 학교에 배정되나"가 화면에 없다.
      const school = found.schoolIds[0] ? await getSchoolDetail(found.schoolIds[0]) : null
      dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: found.apartment.latitude, lng: found.apartment.longitude }, zoom: 15 } })
      if (school) dispatch({ type: 'OPEN_SEARCHED_APARTMENT', payload: { school, apartment: found.apartment } })
      else dispatch({ type: 'SET_SELECTED_APARTMENT', payload: found.apartment })
    } catch (error) {
      console.error('Failed to restore the route:', error)
    } finally {
      restoring.current = false
    }
  }, [dispatch])

  // 처음 열렸을 때, 그리고 뒤로 가기마다 주소를 화면과 선택으로 되돌린다.
  useEffect(() => {
    const restore = async (fromLink: boolean) => {
      const route = parseRoute(window.location.pathname, window.location.search)
      setView(viewOf(route))
      // 처음 열린 주소가 상세라면 바깥(검색엔진·공유 링크·즐겨찾기한 주소)에서 온
      // 것이다. ADR-006의 성패가 이 값으로 판정된다.
      if (fromLink && (route.kind === 'school' || route.kind === 'apartment')) markEntry('link')
      historyTarget.current = !fromLink && (route.kind === 'school' || route.kind === 'apartment') ? route.key : null
      await applyRoute(route)
    }
    const onPopState = () => { void restore(false) }
    void restore(true)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyRoute])

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    if (view === 'map') setMapMounted(true)
  }, [view])

  // 선택이 바뀌면 주소가 따라간다. 아파트가 학교보다 구체적이므로 먼저 본다.
  // 홈에서 검색 결과를 고른 경우도 여기서 상세로 넘어간다 — 홈의 검색창은
  // 지도 쪽과 같은 선택을 바꾸기 때문이다.
  useEffect(() => {
    if (restoring.current) return
    const apartment = state.selectedApartment ? apartmentPath(state.selectedApartment) : null
    const detail = apartment ?? (state.selectedSchool ? schoolPath(state.selectedSchool) : null)
    if (view === 'map') {
      syncPath(detail ?? VIEW_PATHS.map, { push: true })
      return
    }
    if (view === 'home' && detail) {
      // 주소는 화면이 지도로 바뀐 다음 렌더에서 위 분기가 쓴다. 여기서 먼저 쓰면
      // 그 순간의 page_view가 홈 제목을 달고 상세 주소로 기록된다.
      setView('map')
    }
  }, [view, state.selectedApartment, state.selectedSchool])

  // 지도 쪽 canonical은 syncPath가 맞춘다. 홈은 `/`이고, 소식·즐겨찾기는
  // 기기마다 다른 화면이라 색인 대상이 아니다.
  useEffect(() => {
    if (view === 'home') setCanonical(VIEW_PATHS.home)
    else if (view !== 'map') setCanonical(null)
  }, [view])

  // 문서 제목. 브라우저 탭과 GA4의 page_title이 화면을 구분하게 한다. 형식은
  // 프리렌더(api/detail.js)의 제목과 맞추되, 거기에만 있는 수치는 넣지 않는다.
  useEffect(() => {
    const apartment = state.selectedApartment
    const school = state.selectedSchool
    document.title = view === 'map' && apartment
      ? `${apartment.name} 배정 초등학교 | 어디초`
      : view === 'map' && school
        ? `${school.school_name} 배정 아파트 | 어디초`
        : TITLES[view]
  }, [view, state.selectedApartment, state.selectedSchool])

  // 상세 조회. 아파트가 바뀌었으면 아파트 상세, 아파트 없이 학교가 바뀌었으면
  // 학교 상세다. 아파트를 닫고 같은 학교로 돌아온 것은 새 조회가 아니다.
  const lastApartment = useRef<string | null>(null)
  const lastSchool = useRef<string | null>(null)
  useEffect(() => {
    const apartment = state.selectedApartment
    const school = state.selectedSchool
    const apartmentChanged = (apartment?.id ?? null) !== lastApartment.current
    const schoolChanged = (school?.school_id ?? null) !== lastSchool.current
    lastApartment.current = apartment?.id ?? null
    lastSchool.current = school?.school_id ?? null
    const restoredKey = historyTarget.current
    const shown = apartment ? apartment.public_key : school?.school_id
    if (restoredKey && shown && restoredKey === shown.toUpperCase()) {
      historyTarget.current = null
      return
    }
    if (apartment && apartmentChanged) {
      track('view_apartment_detail', {
        complex_public_key: apartment.public_key || undefined,
        school_id: school?.school_id ?? apartment.assigned_school_id,
        region: apartment.city,
        entry_source: takeEntry(),
      })
    } else if (!apartment && school && schoolChanged) {
      track('view_school_detail', {
        school_id: school.school_id,
        region: school.region,
        entry_source: takeEntry(),
      })
    }
  }, [state.selectedApartment, state.selectedSchool])

  // 주소가 바뀔 때마다 page_view. 위의 효과들이 주소와 제목을 맞춘 뒤에 돌도록
  // 맨 뒤에 둔다 — GA4가 스스로 보내게 두면 제목이 바뀌기 전에 기록된다.
  const lastPageView = useRef<string | null>(null)
  useEffect(() => {
    // 주소에서 선택을 복원하는 중에는 아직 그 화면이 아니다. 공유 링크로 들어온
    // 방문이 복원 전 주소와 정규 주소로 두 번 집계되는 것을 막는다.
    if (restoring.current) return
    const here = window.location.pathname
    if (here === lastPageView.current) return
    lastPageView.current = here
    trackPageView()
  })

  // 선택된 학교 상세 정보 바텀시트 상태
  const handleCloseSchoolDetail = () => {
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: null
    })
  }

  const navigate = (path: string) => {
    const route = parseRoute(path)
    const next = viewOf(route)
    if (next !== 'map' && state.ui.sidebar_open) dispatch({ type: 'TOGGLE_SIDEBAR' })
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setView(next)
    void applyRoute(route)
  }

  const handleOpenFavorite = async (favorite: FavoriteRecord) => {
    try {
      const schoolId = favorite.kind === 'school' ? favorite.id : favorite.schoolId
      const school = await getSchoolDetail(schoolId)
      if (!school) return
      dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: favorite.latitude || school.latitude, lng: favorite.longitude || school.longitude }, zoom: 14 } })
      markEntry('favorites')
      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: school })
      // 주소는 선택을 따라가는 효과가 학교 상세로 옮긴다.
      setView('map')
    } catch (error) {
      console.error('Failed to open favorite:', error)
    }
  }

  useEffect(() => {
    const checkConnections = async () => {
      // Test Supabase connection
      const supabaseResult = await testSupabaseConnection()
      
      setConnectionStatus({
        supabase: supabaseResult.success ? 'success' : 'error',
        error: supabaseResult.error
      })
    }

    checkConnections()
  }, [])

  return (
    <MainLayout sidebar={<FilterPanel />} activeView={view} onNavigate={navigate}>
      {mapMounted && (
        <MapErrorBoundary>
          <MapContainer className="h-full w-full" />
        </MapErrorBoundary>
      )}

      {view === 'home' && <HomePage onNavigate={navigate} />}
      {view === 'news' && <NewsPage />}
      {view === 'favorites' && <FavoritesPage onOpen={handleOpenFavorite} />}
      {view === 'privacy' && <PrivacyPage />}
      
      {connectionStatus.supabase === 'error' && (
        <div className="absolute top-4 right-4 z-10 max-w-xs">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-2">
                <p className="text-xs font-medium text-red-800">
                  Supabase 연결 오류
                </p>
                <p className="text-xs text-red-700 mt-1">
                  {connectionStatus.error}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 학교 상세 정보 바텀시트 */}
      <SchoolDetail
        school={state.selectedSchool}
        isOpen={view === 'map' && !!state.selectedSchool}
        onClose={handleCloseSchoolDetail}
      />
    </MainLayout>
  )
}

const TITLES: Record<AppView, string> = {
  home: '어디초 | 초등학교 배정 아파트 찾기',
  map: '배정 지도 | 어디초',
  news: '소식 | 어디초',
  favorites: '즐겨찾기 | 어디초',
  privacy: '개인정보처리방침 | 어디초',
}

const EtlMonitoringPage = lazy(() => import('./components/admin/EtlMonitoringPage'))

function App() {
  const isMonitoringRoute = window.location.pathname === '/admin/etl'
    || new URLSearchParams(window.location.search).get('view') === 'etl'

  return isMonitoringRoute
    ? <Suspense fallback={<main className="etl-center-state">모니터링 로딩 중</main>}><EtlMonitoringPage /></Suspense>
    : <MapApplication />
}

export default App
