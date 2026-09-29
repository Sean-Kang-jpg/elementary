import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import type { AppTab } from './components/layout/BottomNavigation'
import FilterPanel from './components/filters/FilterPanel'
import MapContainer from './components/map/MapContainer'
import MapErrorBoundary from './components/map/MapErrorBoundary'
import SchoolDetail from './components/school/SchoolDetail'
import { useAppContext } from './contexts/AppContext'
import { testSupabaseConnection } from './lib/supabase'
import FavoritesPage from './components/navigation/FavoritesPage'
import NewsPage from './components/navigation/NewsPage'
import { getApartmentByPublicKey, getSchoolDetail } from './services/dataService'
import type { FavoriteRecord } from './utils/favorites'
import {
  apartmentPath,
  parseRoute,
  schoolPath,
  setCanonical,
  syncPath,
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
  const [activeTab, setActiveTab] = useState<AppTab>('map')
  // 주소를 읽어 선택을 복원하는 동안에는 선택을 보고 주소를 쓰면 안 된다.
  // 그러지 않으면 복원 도중의 중간 상태가 기록으로 쌓인다.
  const restoring = useRef(false)

  const applyRoute = useCallback(async (route: Route) => {
    restoring.current = true
    try {
      // admin은 App이 따로 분기하므로 여기까지 오지 않는다.
      if (route.kind === 'map' || route.kind === 'admin') {
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

  // 처음 열렸을 때, 그리고 뒤로 가기마다 주소를 선택으로 되돌린다.
  useEffect(() => {
    void applyRoute(parseRoute(window.location.pathname, window.location.search))
    const onPopState = () => {
      void applyRoute(parseRoute(window.location.pathname, window.location.search))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyRoute])

  // 선택이 바뀌면 주소가 따라간다. 아파트가 학교보다 구체적이므로 먼저 본다.
  useEffect(() => {
    if (restoring.current || activeTab !== 'map') return
    const apartment = state.selectedApartment ? apartmentPath(state.selectedApartment) : null
    const path = apartment ?? (state.selectedSchool ? schoolPath(state.selectedSchool) : null)
    syncPath(path, { push: true })
  }, [activeTab, state.selectedApartment, state.selectedSchool])

  // 지도 화면 자체는 색인 대상이 아니다. 목록만 무한히 색인되게 두지 않는다.
  useEffect(() => {
    if (!state.selectedApartment && !state.selectedSchool) setCanonical('/')
  }, [state.selectedApartment, state.selectedSchool])

  // 선택된 학교 상세 정보 바텀시트 상태
  const handleCloseSchoolDetail = () => {
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: null
    })
  }

  const handleTabChange = (tab: AppTab) => {
    if (tab !== 'map') {
      if (state.ui.sidebar_open) dispatch({ type: 'TOGGLE_SIDEBAR' })
      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
    }
    setActiveTab(tab)
  }

  const handleOpenFavorite = async (favorite: FavoriteRecord) => {
    try {
      const schoolId = favorite.kind === 'school' ? favorite.id : favorite.schoolId
      const school = await getSchoolDetail(schoolId)
      if (!school) return
      dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: favorite.latitude || school.latitude, lng: favorite.longitude || school.longitude }, zoom: 14 } })
      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: school })
      setActiveTab('map')
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
    <MainLayout sidebar={<FilterPanel />} activeTab={activeTab} onTabChange={handleTabChange}>
      <MapErrorBoundary>
        <MapContainer className="h-full w-full" />
      </MapErrorBoundary>

      {activeTab === 'news' && <NewsPage />}
      {activeTab === 'favorites' && <FavoritesPage onOpen={handleOpenFavorite} />}
      
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
        isOpen={activeTab === 'map' && !!state.selectedSchool}
        onClose={handleCloseSchoolDetail}
      />
    </MainLayout>
  )
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
