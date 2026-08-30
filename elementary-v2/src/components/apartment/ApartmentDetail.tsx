/**
 * 아파트 상세 정보 컴포넌트
 * 개별 아파트의 상세 정보를 표시
 */

import React from 'react'
import { Apartment } from '../../types'
import BottomSheet from '../ui/BottomSheet'

interface ApartmentDetailProps {
  apartment: Apartment | null
  isOpen: boolean
  onClose: () => void
  onBack?: () => void
}

const ApartmentDetail: React.FC<ApartmentDetailProps> = ({
  apartment,
  isOpen,
  onClose,
  onBack
}) => {
  if (!apartment) return null

  // 아파트 연식 계산
  const apartmentAge = apartment.age || 0

  // 주차 상태 평가
  const getParkingStatus = (parking: number) => {
    if (parking >= 1.0) return { text: '충분', color: 'text-green-600', bg: 'bg-green-100' }
    if (parking >= 0.7) return { text: '보통', color: 'text-yellow-600', bg: 'bg-yellow-100' }
    return { text: '부족', color: 'text-red-600', bg: 'bg-red-100' }
  }

  // 연식 상태 평가
  const getAgeStatus = (age: number) => {
    if (age <= 5) return { text: '신축', color: 'text-blue-600', bg: 'bg-blue-100' }
    if (age <= 15) return { text: '양호', color: 'text-green-600', bg: 'bg-green-100' }
    if (age <= 25) return { text: '보통', color: 'text-yellow-600', bg: 'bg-yellow-100' }
    return { text: '노후', color: 'text-red-600', bg: 'bg-red-100' }
  }

  // 세대수 규모 평가
  const getScaleStatus = (households: number) => {
    if (households >= 1000) return { text: '대단지', color: 'text-purple-600', bg: 'bg-purple-100' }
    if (households >= 500) return { text: '중단지', color: 'text-blue-600', bg: 'bg-blue-100' }
    if (households >= 200) return { text: '소단지', color: 'text-green-600', bg: 'bg-green-100' }
    return { text: '소규모', color: 'text-gray-600', bg: 'bg-gray-100' }
  }

  const parkingStatus = getParkingStatus(apartment.parking_per_household || 0)
  const ageStatus = getAgeStatus(apartmentAge)
  const scaleStatus = getScaleStatus(apartment.households || 0)

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={apartment.name}
      snapPoints={[0.45, 0.7]}
      defaultSnap={1}
    >
      <div className="p-4 space-y-6">
        {/* 뒤로가기 버튼 */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">아파트 목록으로</span>
          </button>
        )}

        {/* 기본 정보 */}
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <div>{apartment.address}</div>
            <div className="mt-1 text-xs text-gray-500">
              배정학교: {apartment.assigned_school_name}
            </div>
          </div>

          {/* 상태 배지들 */}
          <div className="flex flex-wrap gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${scaleStatus.color} ${scaleStatus.bg}`}>
              {scaleStatus.text}
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${ageStatus.color} ${ageStatus.bg}`}>
              {ageStatus.text} ({apartmentAge}년차)
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${parkingStatus.color} ${parkingStatus.bg}`}>
              주차 {parkingStatus.text}
            </div>
          </div>
        </div>

        {/* 주요 지표 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">주요 정보</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(apartment.households || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">총 세대수</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {apartment.built_year || '-'}
              </div>
              <div className="text-xs text-gray-500">준공연도</div>
            </div>
          </div>
        </div>

        {/* 상세 정보 */}
        <div className="space-y-4">
          <h3 className="font-medium text-gray-900">상세 정보</h3>

          {/* 주차 정보 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0a2 2 0 01-2-2v-2a2 2 0 00-2-2H8z" />
                </svg>
                <span className="font-medium text-gray-900">주차 시설</span>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${parkingStatus.color} ${parkingStatus.bg}`}>
                {parkingStatus.text}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <div>세대당 주차대수: <span className="font-medium">{(apartment.parking_per_household || 0).toFixed(1)}대</span></div>
              <div className="mt-1 text-xs text-gray-500">
                총 주차대수: {apartment.parking_total.toLocaleString()}대
              </div>
              <div className="mt-1 text-xs text-gray-500">
                지상 {apartment.ground_parking.toLocaleString()}대 · 지하 {apartment.underground_parking.toLocaleString()}대
              </div>
            </div>
          </div>

          {/* 공공임대 정보 */}
          {apartment.public_rental_ratio && apartment.public_rental_ratio > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <svg className="h-5 w-5 text-orange-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                </svg>
                <span className="font-medium text-orange-900">공공임대 주택</span>
              </div>
              <div className="text-sm text-orange-800">
                <div>공공임대 비율: <span className="font-medium">{apartment.public_rental_ratio}%</span></div>
                <div className="mt-1 text-xs text-orange-600">
                  약 {apartment.public_rental_units.toLocaleString()}세대가 공공임대
                </div>
              </div>
            </div>
          )}

          {/* 연식 정보 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H5m4 0v-2a2 2 0 012-2h2a2 2 0 012 2v2m-4 0v2m0-2h4" />
                </svg>
                <span className="font-medium text-gray-900">건물 정보</span>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${ageStatus.color} ${ageStatus.bg}`}>
                {ageStatus.text}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <div>준공연도: <span className="font-medium">{apartment.built_year || '-'}년</span></div>
              <div>경과년수: <span className="font-medium">{apartmentAge}년</span></div>
            </div>
          </div>

          {/* 위치 정보 */}
          {apartment.latitude && apartment.longitude && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium text-gray-900">위치 정보</span>
              </div>
              <div className="text-sm text-gray-600">
                <div>위도: {apartment.latitude.toFixed(6)}</div>
                <div>경도: {apartment.longitude.toFixed(6)}</div>
              </div>
            </div>
          )}
        </div>

        {/* 하단 여백 */}
        <div className="h-4"></div>
      </div>
    </BottomSheet>
  )
}

export default ApartmentDetail
