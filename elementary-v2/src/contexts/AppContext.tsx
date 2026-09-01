import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import { FilterState, MapState, UIState, School, Apartment, BreakPoint, UNLIMITED_APARTMENT_AGE } from '../types'

export const DEFAULT_FILTERS: FilterState = {
  target_grade: 1,
  min_students: 0,
  school_types: ['public', 'private', 'national'],
  min_parking_ratio: 0,
  max_apartment_age: UNLIMITED_APARTMENT_AGE,
  max_public_rental_ratio: 100,
  min_households: 0,
  selected_cities: ['서울특별시', '경기도', '인천광역시'],
  selected_districts: [],
}

// 🎯 App State 타입 정의
interface AppState {
  // 필터 상태
  filters: FilterState
  
  // 지도 상태
  map: MapState
  
  // UI 상태
  ui: UIState
  
  // 데이터 상태
  schools: School[]
  apartments: Apartment[]
  selectedSchool: School | null
  selectedApartment: Apartment | null

  // 반응형 상태
  breakpoint: BreakPoint
}

// 🔄 Action 타입 정의
type AppAction =
  // 필터 액션
  | { type: 'SET_FILTER'; payload: Partial<FilterState> }
  | { type: 'RESET_FILTERS' }
  
  // 지도 액션
  | { type: 'SET_MAP_CENTER'; payload: { lat: number; lng: number } }
  | { type: 'SET_MAP_ZOOM'; payload: number }
  | { type: 'SET_MAP_BOUNDS'; payload: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } } }
  | { type: 'SET_MAP_STATE'; payload: { zoom: number; center: { lat: number; lng: number } } }
  
  // UI 액션
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'OPEN_BOTTOM_SHEET'; payload: { school?: School; apartment?: Apartment } }
  | { type: 'CLOSE_BOTTOM_SHEET' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | undefined }
  
  // 데이터 액션
  | { type: 'SET_SCHOOLS'; payload: School[] }
  | { type: 'SET_APARTMENTS'; payload: Apartment[] }
  | { type: 'SET_SELECTED_SCHOOL'; payload: School | null }
  | { type: 'SET_SELECTED_APARTMENT'; payload: Apartment | null }

  // 반응형 액션
  | { type: 'SET_BREAKPOINT'; payload: BreakPoint }

// 🎛️ 초기 상태
const initialState: AppState = {
  filters: DEFAULT_FILTERS,
  
  map: {
    center: { lat: 37.5665, lng: 126.9780 }, // 서울시청
    zoom: 11
  },
  
  ui: {
    sidebar_open: false,
    bottom_sheet_open: false,
    loading: false
  },
  
  schools: [],
  apartments: [],
  selectedSchool: null,
  selectedApartment: null,
  breakpoint: 'desktop'
}

// 🔄 Reducer 함수
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // 필터 관련
    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      }
    
    case 'RESET_FILTERS':
      return {
        ...state,
        filters: initialState.filters
      }
    
    // 지도 관련
    case 'SET_MAP_CENTER':
      return {
        ...state,
        map: { ...state.map, center: action.payload }
      }
    
    case 'SET_MAP_ZOOM':
      return {
        ...state,
        map: { ...state.map, zoom: action.payload }
      }
    
    case 'SET_MAP_BOUNDS':
      return {
        ...state,
        map: { ...state.map, bounds: action.payload }
      }
    
    case 'SET_MAP_STATE':
      return {
        ...state,
        map: { 
          ...state.map, 
          zoom: action.payload.zoom,
          center: action.payload.center 
        }
      }
    
    // UI 관련
    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        ui: { ...state.ui, sidebar_open: !state.ui.sidebar_open }
      }
    
    case 'OPEN_BOTTOM_SHEET':
      return {
        ...state,
        ui: {
          ...state.ui,
          bottom_sheet_open: true,
          selected_school: action.payload.school,
          selected_apartment: action.payload.apartment
        }
      }
    
    case 'CLOSE_BOTTOM_SHEET':
      return {
        ...state,
        ui: {
          ...state.ui,
          bottom_sheet_open: false,
          selected_school: undefined,
          selected_apartment: undefined
        }
      }
    
    case 'SET_LOADING':
      return {
        ...state,
        ui: { ...state.ui, loading: action.payload }
      }
    
    case 'SET_ERROR':
      return {
        ...state,
        ui: { ...state.ui, error: action.payload }
      }
    
    // 데이터 관련
    case 'SET_SCHOOLS':
      return {
        ...state,
        schools: action.payload
      }
    
    case 'SET_APARTMENTS':
      return {
        ...state,
        apartments: action.payload
      }

    case 'SET_SELECTED_SCHOOL':
      return {
        ...state,
        selectedSchool: action.payload,
        selectedApartment: null,
        apartments: [],
      }

    case 'SET_SELECTED_APARTMENT':
      return {
        ...state,
        selectedApartment: action.payload,
      }

    // 반응형 관련
    case 'SET_BREAKPOINT':
      return {
        ...state,
        breakpoint: action.payload
      }
    
    default:
      return state
  }
}

// 🌐 Context 생성
const AppContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<AppAction>
} | undefined>(undefined)

// 🎁 Provider 컴포넌트
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

// 🪝 Custom Hook
export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

// Alias for consistency
export const useAppContext = useApp

// 🎯 편의 Hook들
export function useFilters() {
  const { state, dispatch } = useApp()
  
  const setFilter = (filter: Partial<FilterState>) => {
    dispatch({ type: 'SET_FILTER', payload: filter })
  }
  
  const resetFilters = () => {
    dispatch({ type: 'RESET_FILTERS' })
  }
  
  return {
    filters: state.filters,
    setFilter,
    resetFilters
  }
}

export function useMap() {
  const { state, dispatch } = useApp()
  
  const setCenter = (lat: number, lng: number) => {
    dispatch({ type: 'SET_MAP_CENTER', payload: { lat, lng } })
  }
  
  const setZoom = (zoom: number) => {
    dispatch({ type: 'SET_MAP_ZOOM', payload: zoom })
  }
  
  const setBounds = (bounds: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } }) => {
    dispatch({ type: 'SET_MAP_BOUNDS', payload: bounds })
  }
  
  return {
    map: state.map,
    setCenter,
    setZoom,
    setBounds
  }
}

export function useUI() {
  const { state, dispatch } = useApp()
  
  const toggleSidebar = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }
  
  const openBottomSheet = (school?: School, apartment?: Apartment) => {
    dispatch({ type: 'OPEN_BOTTOM_SHEET', payload: { school, apartment } })
  }
  
  const closeBottomSheet = () => {
    dispatch({ type: 'CLOSE_BOTTOM_SHEET' })
  }
  
  const setLoading = (loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }
  
  const setError = (error?: string) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }
  
  return {
    ui: state.ui,
    toggleSidebar,
    openBottomSheet,
    closeBottomSheet,
    setLoading,
    setError
  }
}
