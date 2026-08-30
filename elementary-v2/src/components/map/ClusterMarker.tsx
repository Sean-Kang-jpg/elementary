import { useEffect, useRef } from 'react'
import { ClusterPoint } from '../../utils/clusterUtils'

interface ClusterMarkerProps {
  cluster: ClusterPoint
  map: NaverMap
  targetGrade: number
  onClick?: (cluster: ClusterPoint) => void
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const ClusterMarker: React.FC<ClusterMarkerProps> = ({ cluster, map, targetGrade, onClick }) => {
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    const maps = window.naver?.maps
    if (!map || !maps || !cluster.center.lat || !cluster.center.lng) return

    const position = new maps.LatLng(cluster.center.lat, cluster.center.lng)
    const average = Math.round(cluster.total_students / cluster.schools.length)
    const content = cluster.label
      ? `<div class="school-cluster-marker school-cluster-marker--district">
          <strong>${escapeHtml(cluster.label)}</strong>
          <span class="school-cluster-marker__high">≥80: ${cluster.high_count || 0}</span>
          <span class="school-cluster-marker__low">&lt;80: ${cluster.low_count || 0}</span>
        </div>`
      : `<div class="school-cluster-marker">
          <strong>${cluster.schools.length}개교</strong>
          <span>${targetGrade}학년 평균 ${average.toLocaleString('ko-KR')}명</span>
        </div>`
    const marker = new maps.Marker({
      position,
      map,
      title: `${cluster.schools.length}개 학교, ${targetGrade}학년 평균 ${average}명`,
      icon: {
        content,
        anchor: new maps.Point(36, 16),
      },
      zIndex: 200,
    })
    markerRef.current = marker

    const clickListener = maps.Event.addListener(marker, 'click', () => {
      onClick?.(cluster)
    })
    const mouseoverListener = maps.Event.addListener(marker, 'mouseover', () => marker.setZIndex(600))
    const mouseoutListener = maps.Event.addListener(marker, 'mouseout', () => marker.setZIndex(200))

    return () => {
      maps.Event.removeListener(clickListener)
      maps.Event.removeListener(mouseoverListener)
      maps.Event.removeListener(mouseoutListener)
      marker.setMap(null)
      markerRef.current = null
    }
  }, [cluster, map, onClick, targetGrade])

  return null
}

export default ClusterMarker
