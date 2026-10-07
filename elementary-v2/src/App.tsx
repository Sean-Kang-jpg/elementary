import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import FilterPanel from './components/filters/FilterPanel'
import MapContainer from './components/map/MapContainer'
import MapErrorBoundary from './components/map/MapErrorBoundary'
import SchoolDetail from './components/school/SchoolDetail'
import { useAppContext } from './contexts/AppContext'
import { testSupabaseConnection } from './lib/supabase'
import MyPage from './components/navigation/MyPage'
import HomePage from './components/navigation/HomePage'
import NewsPage from './components/navigation/NewsPage'
import PrivacyPage from './components/navigation/PrivacyPage'
import LearnPage from './components/navigation/LearnPage'
import GuideListPage from './components/content/GuideListPage'
import GuidePage from './components/content/GuidePage'
import FaqPage from './components/content/FaqPage'
import ChecklistPage from './components/content/ChecklistPage'
import AreaPage from './components/content/AreaPage'
import checklistContent from './content/checklist.json'
import { hasSavedProfile, readProfile, saveProfile, type Profile } from './utils/profile'
import { FAQ_PAGE, findGuide } from './content'
import { readEntryYear } from './utils/entryYear'
import { getApartmentByPublicKey, getSchoolDetail } from './services/dataService'
import type { FavoriteRecord } from './utils/favorites'
import { initAnalytics, markEntry, rememberDetailEntry, takeEntry, track, trackPageView, type EntrySource } from './utils/analytics'
import {
  apartmentPath,
  guidePath,
  parseRoute,
  schoolPath,
  setCanonical,
  syncPath,
  VIEW_PATHS,
  viewOf,
  type AppView,
  type Route,
} from './utils/urlState'

// 지도 위 상세 기록에 남기는 값: 지도 기록 위로 상세가 몇 겹 쌓였는지. 상세를 X로
// 닫으면 그만큼 뒤로 가서, 닫은 상세가 앞으로 가기 쪽에 남고 뒤로 가기가 그 상세를
// 다시 열지 않는다. 링크·홈 검색·MY처럼 지도 기록 없이 열린 상세는 0이다 — 뒤로
// 가면 지도가 아니라 사이트 밖이나 다른 화면으로 가므로, 그때는 주소만 지도로 바꿔 쓴다.
const detailDepthOf = (state: unknown): number => {
  const depth = (state as { detailDepth?: unknown } | null)?.detailDepth
  return typeof depth === 'number' && depth > 0 ? depth : 0
}

const detailKeyOf = (route: Route): string | null =>
  route.kind === 'school' || route.kind === 'apartment' ? route.key : null

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
  // 가이드 화면 안에서 어느 가이드인지. 없으면 목록이다.
  const [guideSlug, setGuideSlug] = useState<string | null>(() => {
    const route = parseRoute(window.location.pathname, window.location.search)
    return route.kind === 'guide' ? route.slug : null
  })
  // 지역 허브 화면 안에서 어느 지역인지. 허브 주소가 아니면 쓰지 않는다.
  const [areaRoute, setAreaRoute] = useState<string>(() => {
    const route = parseRoute(window.location.pathname, window.location.search)
    return route.kind === 'area' ? route.path : VIEW_PATHS.area
  })
  // 아이의 입학연도. 주소(`?year=`)와 메모리에만 둔다 — 기기 저장이 필요 없다.
  // 입학 프로필은 이 기기에만 저장한다(PRD v2 D1 A안). 주소의 `?year=`가 있으면 그것이 우선이다.
  const [profile, setProfile] = useState<Profile>(readProfile)
  // 연달아 누른 설정이 서로 덮어쓰지 않도록, 바꿀 때는 렌더 시점의 값이 아니라
  // 마지막으로 저장한 값에서 계산한다.
  const latestProfile = useRef(profile)
  const [entryYear, setEntryYear] = useState<number | null>(() => readEntryYear() ?? readProfile().entryYear)
  const changeProfile = (update: (current: Profile) => Profile) => {
    const next = update(latestProfile.current)
    latestProfile.current = next
    const first = !hasSavedProfile()
    setProfile(next)
    saveProfile(next)
    if (first) {
      track('start_profile_created', {
        entry_year: next.entryYear ?? undefined,
        school_type_interest: next.interest.join(','),
        moving_plan: next.moving,
      })
    }
  }
  const changeEntryYear = (year: number) => {
    setEntryYear(year)
    changeProfile((current) => ({ ...current, entryYear: year }))
    // 어떤 입학연도가 고려되는지가 곧 아이 연령 분포다(PRD v2 11절의 리서치 신호).
    track('select_entry_year', { entry_year: year })
    if (view === 'guide' || view === 'faq') {
      const url = new URL(window.location.href)
      url.searchParams.set('year', String(year))
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    }
  }
  const showRoute = (route: Route) => {
    setView(viewOf(route))
    setGuideSlug(route.kind === 'guide' ? route.slug : null)
    if (route.kind === 'area') setAreaRoute(route.path)
  }
  // 주소를 읽어 선택을 복원하는 동안에는 선택을 보고 주소를 쓰면 안 된다.
  // 그러지 않으면 복원 도중의 중간 상태가 기록으로 쌓인다.
  const restoring = useRef(false)
  // 뒤로·앞으로 가기로 되돌아온 상세는 새로 연 상세가 아니다. 상세 조회 이벤트를
  // 보내면 한 번 본 학교가 오갈 때마다 다시 집계된다. 시간 구간 플래그로는 안
  // 된다 — 복원이 끝난 뒤에야 React가 다시 그리므로 플래그가 먼저 풀린다. 그래서
  // 되돌아온 대상 자체를 기억했다가 그 선택만 건너뛴다.
  const historyTarget = useRef<string | null>(null)
  const historyGuide = useRef<string | null>(null)
  // 마지막으로 화면에 반영한 주소. 시트를 닫는 뒤로 가기(useCloseOnBack)는 주소가
  // 그대로라 복원할 것이 없다 — 복원하면 학교를 다시 불러와 지도를 옮긴다.
  const shownUrl = useRef<string | null>(null)
  // 되돌아갈 지도 기록이 없는 상세를 닫을 때, 다음 주소 동기화를 쌓지 않고 바꿔 쓴다.
  const closeInPlace = useRef(false)

  // 공개 키로 단지를 찾아 지도 위에 연다. 주소로 들어온 경우와 MY에서 연 경우가 같은 길을 쓴다.
  const openApartment = useCallback(async (key: string): Promise<boolean> => {
    const found = await getApartmentByPublicKey(key)
    if (!found) return false
    // 대표 배정 학교를 함께 연다. 아파트만 띄우면 이 제품이 답하는 질문,
    // "어느 학교에 배정되나"가 화면에 없다.
    const school = found.schoolIds[0] ? await getSchoolDetail(found.schoolIds[0]) : null
    dispatch({ type: 'SET_MAP_STATE', payload: { center: { lat: found.apartment.latitude, lng: found.apartment.longitude }, zoom: 15 } })
    if (school) dispatch({ type: 'OPEN_SEARCHED_APARTMENT', payload: { school, apartment: found.apartment } })
    else dispatch({ type: 'SET_SELECTED_APARTMENT', payload: found.apartment })
    return true
  }, [dispatch])

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
      await openApartment(route.key)
    } catch (error) {
      console.error('Failed to restore the route:', error)
    } finally {
      restoring.current = false
    }
  }, [dispatch, openApartment])

  // 처음 열렸을 때, 그리고 뒤로 가기마다 주소를 화면과 선택으로 되돌린다.
  useEffect(() => {
    const restore = async (fromLink: boolean) => {
      const route = parseRoute(window.location.pathname, window.location.search)
      showRoute(route)
      // 처음 열린 주소가 상세나 가이드라면 바깥(검색엔진·공유 링크·북마크)에서 온
      // 것이다. ADR-006의 성패가 이 값으로 판정된다.
      const entryPage = route.kind === 'school' || route.kind === 'apartment' || route.kind === 'guide' || route.kind === 'faq' || route.kind === 'area'
      if (fromLink && entryPage) markEntry('link')
      historyTarget.current = !fromLink && (route.kind === 'school' || route.kind === 'apartment') ? route.key : null
      historyGuide.current = !fromLink && route.kind === 'guide' ? route.slug : null
      await applyRoute(route)
    }
    const onPopState = () => {
      if (`${window.location.pathname}${window.location.search}` === shownUrl.current) return
      void restore(false)
    }
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
      const target = detail ?? VIEW_PATHS.map
      if (closeInPlace.current) {
        closeInPlace.current = false
        syncPath(target, { push: false })
        return
      }
      const here = parseRoute(window.location.pathname, window.location.search)
      const hereKey = detailKeyOf(here)
      const depth = detailDepthOf(window.history.state)
      // 같은 상세의 다른 철자(이름이 바뀐 옛 링크)는 기록을 쌓지 않고 바꿔 쓴다.
      if (hereKey && detail && detailKeyOf(parseRoute(target, '')) === hereKey) {
        syncPath(target, { push: false, state: { detailDepth: depth } })
        return
      }
      const nextDepth = !detail ? 0 : hereKey ? (depth ? depth + 1 : 0) : (here.kind === 'map' ? 1 : 0)
      syncPath(target, { push: true, state: detail ? { detailDepth: nextDepth } : {} })
      return
    }
    if (view === 'home' && detail) {
      // 주소는 화면이 지도로 바뀐 다음 렌더에서 위 분기가 쓴다. 여기서 먼저 쓰면
      // 그 순간의 page_view가 홈 제목을 달고 상세 주소로 기록된다.
      setView('map')
    }
  }, [view, state.selectedApartment, state.selectedSchool])

  // 지도 쪽 canonical은 syncPath가 맞춘다. 홈·가이드·FAQ는 색인 대상이고,
  // 소식·MY·처리방침은 아니다.
  const guide = findGuide(guideSlug)
  useEffect(() => {
    if (view === 'home') setCanonical(VIEW_PATHS.home)
    else if (view === 'faq') setCanonical(VIEW_PATHS.faq)
    else if (view === 'checklist') setCanonical(VIEW_PATHS.checklist)
    else if (view === 'area') setCanonical(areaRoute)
    else if (view === 'guide') {
      // 없는 가이드 주소는 목록을 보여주고 주소도 목록으로 고친다.
      if (guideSlug && !guide) window.history.replaceState({}, '', VIEW_PATHS.guide)
      setCanonical(guide ? guidePath(guide.slug) : VIEW_PATHS.guide)
    } else {
      // 옛 즐겨찾기 주소로 들어오면 MY의 주소로 고친다.
      if (view === 'my' && window.location.pathname !== VIEW_PATHS.my) window.history.replaceState({}, '', VIEW_PATHS.my)
      if (view !== 'map') setCanonical(null)
    }
  }, [view, guideSlug, guide, areaRoute])

  // 문서 제목. 브라우저 탭과 GA4의 page_title이 화면을 구분하게 한다. 형식은
  // 프리렌더(api/detail.js)의 제목과 맞추되, 거기에만 있는 수치는 넣지 않는다.
  useEffect(() => {
    // 지역 허브는 서버가 지은 제목(학교 수가 들어 있다)을 AreaPage가 쓴다.
    if (view === 'area') return
    const apartment = state.selectedApartment
    const school = state.selectedSchool
    document.title = view === 'map' && apartment
      ? `${apartment.name} 배정 초등학교 | 어디초`
      : view === 'map' && school
        ? `${school.school_name} 배정 아파트 | 어디초`
        : view === 'guide' && guide
          ? `${guide.title} | 어디초`
          : TITLES[view]
  }, [view, state.selectedApartment, state.selectedSchool, guide])

  // 가이드 조회와 FAQ 질문 열람 (PRD v2 12절의 1a 이벤트). 뒤로 가기로 돌아온
  // 가이드는 새 조회가 아니다.
  const lastGuide = useRef<string | null>(null)
  useEffect(() => {
    const shown = view === 'guide' && guide ? guide.slug : null
    if (shown === lastGuide.current) return
    lastGuide.current = shown
    if (!shown) return
    if (historyGuide.current === shown) {
      historyGuide.current = null
      return
    }
    track('view_guide', { guide_id: shown, entry_source: takeEntry('nav') })
  }, [view, guide])
  const faqEntry = useRef<EntrySource>('nav')
  const lastView = useRef<string | null>(null)
  useEffect(() => {
    if (view === 'faq' && lastView.current !== 'faq') faqEntry.current = takeEntry('nav')
    lastView.current = view
  }, [view])
  const openFaqQuestion = (question: string) => {
    track('view_faq', { faq_id: question.slice(0, 100), entry_source: faqEntry.current })
  }

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
      const source = takeEntry()
      rememberDetailEntry(source)
      track('view_apartment_detail', {
        complex_public_key: apartment.public_key || undefined,
        school_id: school?.school_id ?? apartment.assigned_school_id,
        region: apartment.city,
        entry_source: source,
      })
    } else if (!apartment && school && schoolChanged) {
      const source = takeEntry()
      rememberDetailEntry(source)
      track('view_school_detail', {
        school_id: school.school_id,
        region: school.region,
        entry_source: source,
      })
    }
  }, [state.selectedApartment, state.selectedSchool])

  // 주소가 바뀔 때마다 page_view. 위의 효과들이 주소와 제목을 맞춘 뒤에 돌도록
  // 주소를 쓰는 효과들 뒤에 둔다.
  useEffect(() => {
    shownUrl.current = `${window.location.pathname}${window.location.search}`
  })

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
    const depth = detailDepthOf(window.history.state)
    if (depth) {
      // 선택은 뒤로 가기의 복원이 비운다. 여기서 먼저 비우면 주소 동기화가 지도
      // 주소를 새로 쌓아 버린다.
      window.history.go(-depth)
      return
    }
    closeInPlace.current = true
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: null
    })
  }

  const navigate = (path: string, entry?: EntrySource) => {
    const url = new URL(path, window.location.origin)
    const route = parseRoute(url.pathname, url.search)
    const next = viewOf(route)
    if (entry) markEntry(entry)
    if (next !== 'map' && state.ui.sidebar_open) dispatch({ type: 'TOGGLE_SIDEBAR' })
    const year = readEntryYear(url.search)
    if (year) setEntryYear(year)
    if (`${window.location.pathname}${window.location.search}` !== `${url.pathname}${url.search}`) {
      window.history.pushState({}, '', `${url.pathname}${url.search}`)
    }
    showRoute(route)
    void applyRoute(route)
  }

  const handleOpenFavorite = async (favorite: FavoriteRecord) => {
    try {
      // 2026-10-04 전에는 저장한 아파트를 눌러도 배정 학교가 열렸다. 공개 키가 있는
      // 기록은 그 단지를 연다. 키 없는 옛 기록만 학교로 간다.
      if (favorite.kind === 'apartment' && favorite.publicKey) {
        markEntry('favorites')
        if (await openApartment(favorite.publicKey)) {
          setView('map')
          return
        }
      }
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
    <MainLayout sidebar={<FilterPanel />} activeView={view} onNavigate={(path) => navigate(path, 'nav')}>
      {mapMounted && (
        <div className="app-map-area">
          <MapErrorBoundary>
            <MapContainer className="h-full w-full" />
          </MapErrorBoundary>
        </div>
      )}

      {view === 'home' && (
        <HomePage
          onNavigate={(path) => navigate(path, 'home')}
          entryYear={entryYear}
          onEntryYearChange={changeEntryYear}
          profile={profile}
        />
      )}
      {view === 'checklist' && <ChecklistPage onNavigate={(path) => navigate(path, 'related')} />}
      {view === 'guide' && (guide
        ? <GuidePage key={guide.slug} guide={guide} onNavigate={(path) => navigate(path, 'related')} />
        : <GuideListPage onNavigate={(path) => navigate(path, 'guides')} entryYear={entryYear} />)}
      {view === 'faq' && (
        <FaqPage onNavigate={(path) => navigate(path, 'related')} entryYear={entryYear} onEntryYearChange={changeEntryYear} onOpenQuestion={openFaqQuestion} />
      )}
      {view === 'area' && <AreaPage key={areaRoute} path={areaRoute} onNavigate={(path) => navigate(path, 'related')} />}
      {view === 'news' && <NewsPage />}
      {view === 'my' && (
        <MyPage
          onNavigate={(path) => navigate(path, 'related')}
          onOpenSaved={handleOpenFavorite}
          entryYear={entryYear}
          onEntryYearChange={changeEntryYear}
          profile={profile}
          onProfileChange={changeProfile}
        />
      )}
      {view === 'learn' && <LearnPage onNavigate={(path) => navigate(path, 'related')} />}
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
        onOpenGuide={(path) => navigate(path, 'detail')}
      />
    </MainLayout>
  )
}

const TITLES: Record<AppView, string> = {
  home: '어디초 | 초등학교 배정 아파트 찾기',
  map: '배정 지도 | 어디초',
  news: '소식 | 어디초',
  my: 'MY | 어디초',
  privacy: '개인정보처리방침 | 어디초',
  guide: '입학 준비 가이드 | 어디초',
  faq: `${FAQ_PAGE.title} | 어디초`,
  checklist: `${checklistContent.title} | 어디초`,
  learn: '학습 준비 | 어디초',
  area: '지역별 초등학교 배정 현황 | 어디초',
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
