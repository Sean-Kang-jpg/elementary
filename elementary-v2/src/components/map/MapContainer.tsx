import { LocateFixed, LoaderCircle, X } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../../contexts/AppContext'
import MarkerManager from './MarkerManager'
import ApartmentMarkerManager from './ApartmentMarkerManager'
import '../../types/naver-maps.d.ts'

interface MapContainerProps {
  className?: string
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 }

const MapContainer: React.FC<MapContainerProps> = ({ className = '' }) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const naverMapRef = useRef<NaverMap | null>(null)
  const locationMarkerRef = useRef<Marker | null>(null)
  const mapListenersRef = useRef<unknown[]>([])
  const [isMapReady, setIsMapReady] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const { state, dispatch } = useAppContext()

  const initializeMap = useCallback(() => {
    if (!mapRef.current || naverMapRef.current) return
    if (!window.naver?.maps) {
      setMapError('네이버 지도 API를 불러오지 못했습니다. 지도 설정을 확인해 주세요.')
      return
    }

    try {
      const map = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        zoom: 11,
        minZoom: 8,
        maxZoom: 18,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position?.TOP_RIGHT || 'TOP_RIGHT',
          style: window.naver.maps.ZoomControlStyle?.SMALL || 'SMALL',
        },
        mapTypeControl: false,
        scaleControl: true,
        logoControl: true,
        mapDataControl: false,
      })
      naverMapRef.current = map

      const syncMapViewport = () => {
        const center = map.getCenter()
        dispatch({
          type: 'SET_MAP_STATE',
          payload: { zoom: map.getZoom(), center: { lat: center.lat(), lng: center.lng() } },
        })
        const bounds = map.getBounds()
        if (bounds) {
          dispatch({
            type: 'SET_MAP_BOUNDS',
            payload: {
              northeast: { lat: bounds.getNE().lat(), lng: bounds.getNE().lng() },
              southwest: { lat: bounds.getSW().lat(), lng: bounds.getSW().lng() },
            },
          })
        }
      }

      mapListenersRef.current = [window.naver.maps.Event.addListener(map, 'idle', syncMapViewport)]
      syncMapViewport()
      setIsMapReady(true)
      setMapError(null)
    } catch (error) {
      setMapError(`지도를 초기화하지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    }
  }, [dispatch])

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('이 브라우저에서는 현재 위치를 사용할 수 없습니다.')
      return
    }

    setIsLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const maps = window.naver?.maps
        const map = naverMapRef.current
        if (!maps || !map) {
          setLocationError('지도가 준비된 후 다시 시도해 주세요.')
          setIsLocating(false)
          return
        }

        const position = new maps.LatLng(coords.latitude, coords.longitude)
        if (locationMarkerRef.current) {
          locationMarkerRef.current.setPosition(position)
        } else {
          locationMarkerRef.current = new maps.Marker({
            position,
            map,
            title: '현재 위치',
            zIndex: 2000,
          })
        }
        dispatch({
          type: 'SET_MAP_STATE',
          payload: { center: { lat: coords.latitude, lng: coords.longitude }, zoom: 15 },
        })
        setIsLocating(false)
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? '위치 권한을 허용하면 주변 학교를 바로 볼 수 있습니다.'
          : '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        setLocationError(message)
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }, [dispatch])

  useEffect(() => {
    const checkNaverMaps = () => {
      if (window.naver?.maps) initializeMap()
      else window.setTimeout(checkNaverMaps, 100)
    }
    checkNaverMaps()

    return () => {
      const maps = window.naver?.maps
      if (maps?.Event) mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      mapListenersRef.current = []
      locationMarkerRef.current?.destroy()
      locationMarkerRef.current = null
      naverMapRef.current?.destroy()
      naverMapRef.current = null
    }
  }, [initializeMap])

  useEffect(() => {
    if (!isMapReady || !navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (permission.state === 'granted') locateUser()
    }).catch(() => undefined)
  }, [isMapReady, locateUser])

  useEffect(() => {
    const maps = window.naver?.maps
    if (naverMapRef.current && maps?.LatLng) {
      naverMapRef.current.setCenter(new maps.LatLng(state.map.center.lat, state.map.center.lng))
    }
  }, [state.map.center])

  useEffect(() => {
    if (naverMapRef.current) naverMapRef.current.setZoom(state.map.zoom)
  }, [state.map.zoom])

  if (mapError) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="max-w-md p-6 text-center">
          <h2 className="font-semibold text-red-700">지도를 열 수 없습니다</h2>
          <p className="mt-2 text-sm text-gray-600">{mapError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            다시 불러오기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="h-full w-full" aria-label="주변 초등학교 지도" />
      {isMapReady && <MarkerManager map={naverMapRef.current} />}
      {isMapReady && naverMapRef.current && <ApartmentMarkerManager map={naverMapRef.current} />}

      {!isMapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80">
          <LoaderCircle className="animate-spin text-blue-600" size={28} aria-hidden="true" />
          <span className="ml-2 text-sm text-gray-700">지도를 불러오는 중</span>
        </div>
      )}

      {isMapReady && (
        <button
          type="button"
          onClick={locateUser}
          disabled={isLocating}
          className="absolute bottom-6 right-3 z-10 inline-flex h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 shadow-md hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70 sm:right-5"
          aria-label="현재 위치에서 주변 학교 보기"
          title="현재 위치에서 주변 학교 보기"
        >
          {isLocating
            ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
            : <LocateFixed size={18} aria-hidden="true" />}
          <span>내 주변</span>
        </button>
      )}

      {locationError && (
        <div className="absolute bottom-20 right-3 z-10 flex max-w-xs items-start gap-2 rounded-md border border-amber-200 bg-white p-3 text-sm text-gray-700 shadow-lg sm:right-5" role="alert">
          <span>{locationError}</span>
          <button type="button" onClick={() => setLocationError(null)} aria-label="위치 안내 닫기" className="text-gray-500 hover:text-gray-800">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

export default MapContainer
