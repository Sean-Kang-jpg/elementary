import { useEffect, useRef } from 'react'
import { School } from '../../types'

interface SchoolMarkerProps {
  school: School
  map: NaverMap
  targetGrade: number
  selected?: boolean
  dimmed?: boolean
  onClick?: (school: School) => void
  onHover?: (school: School) => void
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const getGradeStudents = (school: School, grade: number) => (
  Number(school[`grade${grade}_students` as keyof School]) || 0
)

const createMarkerContent = (school: School, targetGrade: number, selected: boolean, dimmed: boolean) => {
  const students = getGradeStudents(school, targetGrade)
  return `
    <div class="school-map-marker${selected ? ' school-map-marker--selected' : ''}${dimmed ? ' school-map-marker--dimmed' : ''}" data-school-id="${escapeHtml(school.school_id)}">
      <span class="school-map-marker__name">${escapeHtml(school.school_name)}</span>
      <span class="school-map-marker__count">${students.toLocaleString('ko-KR')}명</span>
    </div>
  `
}

const SchoolMarker: React.FC<SchoolMarkerProps> = ({
  school,
  map,
  targetGrade,
  selected = false,
  dimmed = false,
  onClick,
  onHover,
}) => {
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    const maps = window.naver?.maps
    if (!map || !maps || !school.latitude || !school.longitude) return

    const students = getGradeStudents(school, targetGrade)
    const restingZIndex = selected ? 800 : dimmed ? 50 : 100
    const marker = new maps.Marker({
      position: new maps.LatLng(school.latitude, school.longitude),
      map,
      title: `${school.school_name}, ${targetGrade}학년 ${students}명`,
      icon: {
        content: createMarkerContent(school, targetGrade, selected, dimmed),
        anchor: new maps.Point(30, 18),
      },
      zIndex: restingZIndex,
    })
    markerRef.current = marker

    const clickListener = maps.Event.addListener(marker, 'click', () => onClick?.(school))
    const mouseoverListener = maps.Event.addListener(marker, 'mouseover', () => {
      marker.setZIndex(500)
      onHover?.(school)
    })
    const mouseoutListener = maps.Event.addListener(marker, 'mouseout', () => marker.setZIndex(restingZIndex))

    return () => {
      try {
        maps.Event.removeListener(clickListener)
        maps.Event.removeListener(mouseoverListener)
        maps.Event.removeListener(mouseoutListener)
      } catch {
        // Naver Maps may release listeners while replacing many markers.
      }
      try {
        marker.setMap(null)
      } catch {
        // Marker cleanup is intentionally idempotent.
      }
      markerRef.current = null
    }
  }, [dimmed, map, onClick, onHover, school, selected, targetGrade])

  return null
}

export default SchoolMarker
