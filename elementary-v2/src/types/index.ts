// 🏫 학교 관련 타입 (ETL 데이터 구조 기반)
export interface School {
  // 기본 정보
  school_id: string // ETL: school_id (B000025614 형식)
  school_name: string // ETL: school_name
  school_type: string // ETL: school_type (초등학교)

  // 주소 정보
  address: string // ETL: address (도로명주소)
  address_old?: string // ETL: address_old (지번주소)
  region: string // ETL: region (서울특별시, 경기도, 인천광역시)
  province: string // ETL: province
  city?: string
  district?: string
  neighborhood?: string

  // 좌표 정보
  latitude: number // ETL: latitude (string을 number로 변환)
  longitude: number // ETL: longitude (string을 number로 변환)

  // 설립 정보
  establishment_date?: string // ETL: establishment_date
  establishment_type?: string // ETL: establishment_type (공립/사립)
  operation_status?: string // ETL: operation_status

  // 교육청 정보
  education_office?: string // ETL: education_office
  education_support_office?: string // ETL: education_support_office

  // 연락처 정보
  homepage?: string | null // ETL: homepage
  phone?: string | null // ETL: phone
  fax?: string | null // ETL: fax
  postal_code?: string | null // ETL: postal_code
  english_name?: string | null // ETL: english_name

  // 학년별 학급수 (KERIS 데이터)
  grade1_classes: number // ETL: grade1_classes
  grade2_classes: number // ETL: grade2_classes
  grade3_classes: number // ETL: grade3_classes
  grade4_classes: number // ETL: grade4_classes
  grade5_classes: number // ETL: grade5_classes
  grade6_classes: number // ETL: grade6_classes

  // 학년별 학생수 (KERIS 데이터)
  grade1_students: number // ETL: grade1_students
  grade2_students: number // ETL: grade2_students
  grade3_students: number // ETL: grade3_students
  grade4_students: number // ETL: grade4_students
  grade5_students: number // ETL: grade5_students
  grade6_students: number // ETL: grade6_students

  // 학년별 학급당 평균
  grade1_per_class?: number // ETL: grade1_per_class
  grade2_per_class?: number // ETL: grade2_per_class
  grade3_per_class?: number // ETL: grade3_per_class
  grade4_per_class?: number // ETL: grade4_per_class
  grade5_per_class?: number // ETL: grade5_per_class
  grade6_per_class?: number // ETL: grade6_per_class

  // 집계 정보
  total_students: number // ETL: total_students (계산된 값)
  teachers: number // ETL: teachers

  // 매칭 정보
  keris_matched: boolean // ETL: keris_matched
  neis_matched?: boolean // ETL: neis_matched
  neis_school_code?: string | null // ETL: neis_school_code

  // 메타 정보
  reference_date?: string // ETL: reference_date
  student_statistics_year?: number
  student_data_status?: string

  // 계산된 필드들 (프론트엔드 사용)
  school_size_category?: 'large' | 'small' // grade1_students >= 80 기준
  coordinates_valid?: boolean // latitude, longitude null 체크
}

// GradeStats 제거 - 개별 필드로 대체됨 (grade1_students, grade1_classes 등)

// 🏠 아파트 관련 타입  
export interface Apartment {
  id: string
  name: string
  address: string
  district: string
  city: string
  latitude: number
  longitude: number
  
  // 아파트 상세 정보
  households: number // 세대수
  built_year: number // 건축년도
  age: number // 연식
  
  // 주차 정보
  parking_total: number // 총 주차대수
  parking_per_household: number // 세대당 주차대수
  underground_parking: number // 지하주차
  ground_parking: number // 지상주차
  
  // 공공임대 정보
  public_rental_units: number // 공공임대 세대수
  public_rental_ratio: number // 공공임대 비율 (%)
  private_rental_units?: number // 민간임대 세대수
  rental_units_total?: number // 전체 임대 세대수
  sale_households?: number // 분양 세대수
  
  // 비정규화: 배정 학교 정보
  assigned_school_id: string
  assigned_school_name: string
}

// 🎛️ 필터 관련 타입
export interface FilterState {
  // 학교 필터
  target_grade: number // 기준 학년 (기본: 1)
  min_students: number // 최소 학생수 (기본: 80)
  school_types: ('public' | 'private' | 'national')[]
  
  // 아파트 필터
  min_parking_ratio: number // 최소 주차비율 (기본: 0.5)
  max_apartment_age: number // 최대 연식 (기본: 30)
  max_public_rental_ratio: number // 최대 공공임대 비율 (기본: 100)
  min_households: number // 최소 세대수 (기본: 100)
  
  // 지역 필터
  selected_cities: string[] // 선택된 시/도
  selected_districts: string[] // 선택된 구/군
}

// 🗺️ 지도 관련 타입
export interface Coordinates {
  lat: number
  lng: number
}

export interface MapBounds {
  northeast: Coordinates
  southwest: Coordinates
}

export interface MapState {
  center: { lat: number; lng: number }
  zoom: number
  bounds?: MapBounds
}

export interface MapDisplayLevel {
  level: 'city' | 'district' | 'school'
  zoom_range: [number, number]
}

// 📊 집계 데이터 타입 (축척별 표시용)
export interface CityStats {
  city: string
  total_schools: number
  large_schools: number // 기준 이상
  small_schools: number // 기준 미만
  total_apartments: number
}

export interface DistrictStats {
  district: string
  city: string
  total_schools: number
  large_schools: number
  small_schools: number
  total_apartments: number
}

// 🔍 검색 관련 타입
export interface SearchResult {
  type: 'school' | 'apartment'
  id: string
  name: string
  address: string
  district: string
  city: string
  coordinates: { lat: number; lng: number }
  school?: School
  apartment?: Apartment
  assigned_schools?: Array<{ school_id: string; school_name: string; assignment_rank: number }>
}

// 💾 캐시 관련 타입
export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time To Live (ms)
}

export interface RegionalCache {
  schools: CacheEntry<School[]>
  apartments: CacheEntry<Apartment[]>
  city_stats: CacheEntry<CityStats[]>
  district_stats: CacheEntry<DistrictStats[]>
}

// 🎯 UI 상태 타입
export interface UIState {
  sidebar_open: boolean
  bottom_sheet_open: boolean
  selected_school?: School
  selected_apartment?: Apartment
  loading: boolean
  error?: string
}

// 📱 반응형 관련 타입
export type BreakPoint = 'mobile' | 'tablet' | 'desktop'

export interface ResponsiveState {
  breakpoint: BreakPoint
  is_mobile: boolean
  sidebar_mode: 'overlay' | 'side' // 모바일: overlay, 데스크톱: side
}

export const UNLIMITED_APARTMENT_AGE = 200
