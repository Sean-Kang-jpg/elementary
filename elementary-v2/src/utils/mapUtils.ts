/**
 * 지도 유틸리티 함수들
 * 축척별 데이터 표시 로직 및 지도 관련 헬퍼 함수들
 */

import { MapBounds, Coordinates } from '../types'

/**
 * 줌 레벨에 따른 표시 모드 결정
 */
export type DisplayMode = 'CITIES' | 'DISTRICTS' | 'SCHOOLS'

export const getDisplayMode = (zoomLevel: number): DisplayMode => {
  if (zoomLevel >= 11) return 'SCHOOLS'     // 개별 학교 표시 (줌 11+)
  if (zoomLevel >= 10) return 'DISTRICTS'   // 구별 집계 표시 (줌 10)
  return 'CITIES'                           // 시도별 집계 표시 (줌 7-9)
}

/**
 * 표시 모드별 설명
 */
export const getDisplayModeDescription = (mode: DisplayMode): string => {
  switch (mode) {
    case 'CITIES':
      return '시도별 집계 데이터 표시'
    case 'DISTRICTS':
      return '구별 집계 데이터 표시'
    case 'SCHOOLS':
      return '개별 학교 마커 표시'
  }
}

/**
 * 줌 레벨별 권장 데이터 개수
 */
export const getRecommendedDataLimit = (zoomLevel: number): number => {
  if (zoomLevel >= 13) return 500   // 개별 학교: 최대 500개
  if (zoomLevel >= 10) return 100   // 구별 집계: 최대 100개
  return 30                         // 시도별 집계: 최대 30개
}

/**
 * 경계 박스 계산
 */
export const calculateBounds = (coordinates: Coordinates[]): MapBounds | null => {
  if (coordinates.length === 0) return null

  let minLat = coordinates[0].lat
  let maxLat = coordinates[0].lat
  let minLng = coordinates[0].lng
  let maxLng = coordinates[0].lng

  for (const coord of coordinates) {
    minLat = Math.min(minLat, coord.lat)
    maxLat = Math.max(maxLat, coord.lat)
    minLng = Math.min(minLng, coord.lng)
    maxLng = Math.max(maxLng, coord.lng)
  }

  return {
    northeast: { lat: maxLat, lng: maxLng },
    southwest: { lat: minLat, lng: minLng }
  }
}

/**
 * 두 좌표 간 거리 계산 (Haversine formula)
 * @param coord1 첫 번째 좌표
 * @param coord2 두 번째 좌표
 * @returns 거리 (km)
 */
export const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
  const R = 6371 // 지구 반지름 (km)
  const dLat = toRadians(coord2.lat - coord1.lat)
  const dLng = toRadians(coord2.lng - coord1.lng)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) * Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * 도를 라디안으로 변환
 */
const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180)
}

/**
 * 경계 박스 내에 좌표가 포함되는지 확인
 */
export const isWithinBounds = (coordinate: Coordinates, bounds: MapBounds): boolean => {
  return (
    coordinate.lat >= bounds.southwest.lat &&
    coordinate.lat <= bounds.northeast.lat &&
    coordinate.lng >= bounds.southwest.lng &&
    coordinate.lng <= bounds.northeast.lng
  )
}

/**
 * 캐시 키 생성 (지역 + 줌 레벨 + 필터 기반)
 */
export const generateCacheKey = (
  bounds: MapBounds,
  zoomLevel: number,
  grade?: number,
  minStudents?: number,
  filterScope = ''
): string => {
  const { northeast, southwest } = bounds
  const boundsStr = `${southwest.lat.toFixed(4)},${southwest.lng.toFixed(4)},${northeast.lat.toFixed(4)},${northeast.lng.toFixed(4)}`
  const filterStr = `z${zoomLevel}_g${grade || 'all'}_s${minStudents || 'all'}`
  return `${boundsStr}_${filterStr}_${filterScope}`
}

/**
 * 줌 레벨별 적절한 정밀도 계산
 */
export const getCoordinatePrecision = (zoomLevel: number): number => {
  if (zoomLevel >= 15) return 6  // 매우 높은 정밀도
  if (zoomLevel >= 12) return 5  // 높은 정밀도
  if (zoomLevel >= 9) return 4   // 보통 정밀도
  return 3                       // 낮은 정밀도
}

/**
 * 서울/경기/인천 지역 기본 경계
 */
export const REGION_BOUNDS = {
  SEOUL: {
    northeast: { lat: 37.7015, lng: 127.1835 },
    southwest: { lat: 37.4265, lng: 126.7645 }
  },
  GYEONGGI: {
    northeast: { lat: 38.2756, lng: 127.5635 },
    southwest: { lat: 36.8935, lng: 126.4745 }
  },
  INCHEON: {
    northeast: { lat: 37.7845, lng: 126.9285 },
    southwest: { lat: 37.2135, lng: 126.1675 }
  },
  ALL: {
    northeast: { lat: 38.3, lng: 127.6 },
    southwest: { lat: 36.8, lng: 126.1 }
  }
} as const

/**
 * 기본 중심점들
 */
export const DEFAULT_CENTERS = {
  SEOUL: { lat: 37.5665, lng: 126.9780 },      // 서울시청
  GYEONGGI: { lat: 37.4138, lng: 127.5183 },   // 경기도청
  INCHEON: { lat: 37.4563, lng: 126.7052 },    // 인천시청
  ALL: { lat: 37.5, lng: 127.0 }               // 수도권 중심
} as const
