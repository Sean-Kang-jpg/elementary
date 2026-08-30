/**
 * 마커 클러스터링 유틸리티
 * 줌 레벨에 따라 가까운 마커들을 그룹화
 */

import { School } from '../types'

export interface ClusterPoint {
  schools: School[]
  label?: string
  high_count?: number
  low_count?: number
  center: {
    lat: number
    lng: number
  }
  total_students: number
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
}

const getGradeStudents = (school: School, grade: number) => (
  Number(school[`grade${grade}_students` as keyof School]) || 0
)

/**
 * 줌 레벨에 따른 클러스터 거리 계산
 */
const getClusterDistance = (zoomLevel: number): number => {
  // 줌 레벨이 높을수록 클러스터 거리를 작게 설정
  if (zoomLevel >= 15) return 0.001  // 약 100m
  if (zoomLevel >= 13) return 0.005  // 약 500m
  if (zoomLevel >= 11) return 0.01   // 약 1km
  if (zoomLevel >= 9) return 0.02    // 약 2km
  return 0.05  // 약 5km
}

/**
 * 두 좌표 간 거리 계산 (단순화된 유클리드 거리)
 */
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const dlat = lat1 - lat2
  const dlng = lng1 - lng2
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

/**
 * 학교 데이터를 클러스터링
 */
export const clusterSchools = (
  schools: School[],
  zoomLevel: number,
  viewportWidth = 1440,
  targetGrade = 1,
): ClusterPoint[] => {
  if (!schools || schools.length === 0) return []

  const mobileMultiplier = zoomLevel <= 11 ? 3.4 : zoomLevel <= 13 ? 2.2 : 1.4
  const viewportMultiplier = viewportWidth <= 640 ? mobileMultiplier : viewportWidth <= 1024 ? 1.4 : 1
  const clusterDistance = getClusterDistance(zoomLevel) * viewportMultiplier
  const clusters: ClusterPoint[] = []
  const processed = new Set<number>()

  schools.forEach((school, index) => {
    if (processed.has(index) || !school.latitude || !school.longitude) return

    const cluster: ClusterPoint = {
      schools: [school],
      center: {
        lat: school.latitude,
        lng: school.longitude
      },
      total_students: getGradeStudents(school, targetGrade),
      bounds: {
        north: school.latitude,
        south: school.latitude,
        east: school.longitude,
        west: school.longitude
      }
    }

    processed.add(index)

    // 주변 학교들 찾기
    schools.forEach((otherSchool, otherIndex) => {
      if (
        processed.has(otherIndex) ||
        !otherSchool.latitude ||
        !otherSchool.longitude ||
        index === otherIndex
      ) return

      const distance = calculateDistance(
        school.latitude,
        school.longitude,
        otherSchool.latitude,
        otherSchool.longitude
      )

      if (distance <= clusterDistance) {
        cluster.schools.push(otherSchool)
        cluster.total_students += getGradeStudents(otherSchool, targetGrade)

        // 경계 업데이트
        cluster.bounds.north = Math.max(cluster.bounds.north, otherSchool.latitude)
        cluster.bounds.south = Math.min(cluster.bounds.south, otherSchool.latitude)
        cluster.bounds.east = Math.max(cluster.bounds.east, otherSchool.longitude)
        cluster.bounds.west = Math.min(cluster.bounds.west, otherSchool.longitude)

        processed.add(otherIndex)
      }
    })

    // 중심점 재계산
    if (cluster.schools.length > 1) {
      const avgLat = cluster.schools.reduce((sum, s) => sum + (s.latitude || 0), 0) / cluster.schools.length
      const avgLng = cluster.schools.reduce((sum, s) => sum + (s.longitude || 0), 0) / cluster.schools.length
      cluster.center = { lat: avgLat, lng: avgLng }
    }

    clusters.push(cluster)
  })

  return clusters
}

const groupSchoolsByLabel = (
  schools: School[],
  getLabel: (school: School) => string,
  targetGrade: number,
): ClusterPoint[] => {
  const groups = new Map<string, School[]>()
  schools.forEach((school) => {
    const label = getLabel(school)
    const key = `${school.region}/${school.district || ''}/${label}`
    groups.set(key, [...(groups.get(key) || []), school])
  })

  return Array.from(groups.values()).map((group) => {
    const latitudes = group.map((school) => school.latitude)
    const longitudes = group.map((school) => school.longitude)
    const highCount = group.filter((school) => getGradeStudents(school, targetGrade) >= 80).length
    return {
      schools: group,
      label: getLabel(group[0]),
      high_count: highCount,
      low_count: group.length - highCount,
      center: {
        lat: latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length,
        lng: longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length,
      },
      total_students: group.reduce((sum, school) => sum + getGradeStudents(school, targetGrade), 0),
      bounds: {
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        east: Math.max(...longitudes),
        west: Math.min(...longitudes),
      },
    }
  })
}

export const groupSchoolsByDistrict = (schools: School[], targetGrade = 1): ClusterPoint[] => (
  groupSchoolsByLabel(
    schools,
    (school) => school.district || school.city || school.region || '기타 지역',
    targetGrade,
  )
)

export const getSchoolNeighborhoodLabel = (school: School) => (
  school.neighborhood || school.district || school.city || '기타 동'
)

export const groupSchoolsByNeighborhood = (schools: School[], targetGrade = 1): ClusterPoint[] => (
  groupSchoolsByLabel(
    schools,
    getSchoolNeighborhoodLabel,
    targetGrade,
  )
)

/**
 * 클러스터 마커 아이콘 생성
 */
export const createClusterIcon = (
  schoolCount: number,
  totalStudents: number,
  size: 'small' | 'medium' | 'large' = 'medium'
): string => {
  const sizeMap = {
    small: { width: 32, height: 32, fontSize: 10 },
    medium: { width: 40, height: 40, fontSize: 12 },
    large: { width: 48, height: 48, fontSize: 14 }
  }

  const { width, height, fontSize } = sizeMap[size]
  const avgStudents = Math.round(totalStudents / schoolCount)

  // 평균 학생수에 따른 색상
  const color = avgStudents >= 80 ? '#10B981' : '#F59E0B'
  const bgColor = avgStudents >= 80 ? '#ECFDF5' : '#FEF3C7'

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="${width/2}"
        cy="${height/2}"
        r="${width/2 - 2}"
        fill="${bgColor}"
        stroke="${color}"
        stroke-width="2"
      />
      <text
        x="${width/2}"
        y="${height/2 - 2}"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${color}"
      >
        ${schoolCount}
      </text>
      <text
        x="${width/2}"
        y="${height/2 + fontSize - 2}"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="${fontSize - 2}"
        fill="${color}"
      >
        개교
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * 줌 레벨에 따른 클러스터 크기 결정
 */
export const getClusterSize = (schoolCount: number, zoomLevel: number): 'small' | 'medium' | 'large' => {
  if (zoomLevel >= 13) {
    return schoolCount >= 10 ? 'large' : schoolCount >= 5 ? 'medium' : 'small'
  } else if (zoomLevel >= 10) {
    return schoolCount >= 20 ? 'large' : schoolCount >= 10 ? 'medium' : 'small'
  } else {
    return schoolCount >= 50 ? 'large' : schoolCount >= 20 ? 'medium' : 'small'
  }
}

/**
 * 클러스터 정보창 콘텐츠 생성
 */
export const createClusterInfoContent = (cluster: ClusterPoint): string => {
  const avgStudents = Math.round(cluster.total_students / cluster.schools.length)
  const largeSchools = cluster.schools.filter(s => (s.grade1_students || 0) >= 80).length
  const smallSchools = cluster.schools.length - largeSchools

  return `
    <div style="padding: 12px; min-width: 250px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="font-weight: 600; color: #1f2937; margin-bottom: 8px; font-size: 14px;">
        학교 클러스터 (${cluster.schools.length}개교)
      </div>

      <div style="margin-bottom: 8px;">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">구성</div>
        <div style="display: flex; gap: 8px;">
          ${largeSchools > 0 ? `
            <span style="
              background-color: #ecfdf5;
              color: #10b981;
              padding: 2px 6px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 500;
            ">
              대형교 ${largeSchools}개
            </span>
          ` : ''}
          ${smallSchools > 0 ? `
            <span style="
              background-color: #fef3c7;
              color: #f59e0b;
              padding: 2px 6px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 500;
            ">
              소형교 ${smallSchools}개
            </span>
          ` : ''}
        </div>
      </div>

      <div style="margin-bottom: 8px;">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">통계</div>
        <div style="font-size: 11px; color: #9ca3af; line-height: 1.4;">
          • 총 1학년 학생수: ${cluster.total_students.toLocaleString()}명<br>
          • 평균 학생수: ${avgStudents}명/교
        </div>
      </div>

      <div style="font-size: 10px; color: #9ca3af; text-align: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
        확대하여 개별 학교 보기
      </div>
    </div>
  `
}
