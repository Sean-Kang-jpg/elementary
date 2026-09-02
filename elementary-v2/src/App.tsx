import { lazy, Suspense, useEffect, useState } from 'react'
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
import { getSchoolDetail } from './services/dataService'
import type { FavoriteRecord } from './utils/favorites'

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
