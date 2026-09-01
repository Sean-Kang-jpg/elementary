import { supabase } from '../lib/supabase'
import { UNLIMITED_APARTMENT_AGE } from '../types'
import type { Apartment, Coordinates, FilterState, MapBounds, School } from '../types'
import { getSchoolNeighborhoodLabel } from '../utils/clusterUtils'
import { generateCacheKey, getDisplayMode } from '../utils/mapUtils'

export interface RegionData {
  region: string
  region_name: string
  total_schools: number
  total_students: number
  avg_students_per_school: number
  keris_integration_rate: number
  center: Coordinates
}

type SchoolMasterRow = Record<string, unknown>
type ApartmentServingRow = Record<string, unknown>

const SCHOOL_SELECT_FIELDS = [
  'school_id', 'school_name', 'school_type', 'road_address', 'legal_address', 'region',
  'latitude', 'longitude', 'establishment_date', 'establishment_type', 'operation_status',
  'education_office', 'education_support_office', 'homepage', 'phone',
  ...Array.from({ length: 6 }, (_, index) => `grade${index + 1}_students`),
  ...Array.from({ length: 6 }, (_, index) => `grade${index + 1}_classes`),
  ...Array.from({ length: 6 }, (_, index) => `grade${index + 1}_per_class`),
  'total_students', 'teachers', 'reference_date', 'student_statistics_year', 'student_data_status',
].join(',')

const APARTMENT_SELECT_FIELDS = [
  'school_id', 'school_name', 'canonical_complex_id', 'complex_name', 'road_address',
  'region', 'district', 'latitude', 'longitude', 'households', 'use_approval_year',
  'parking_total', 'parking_ground', 'parking_underground', 'parking_per_household',
  'sale_households', 'rental_units_total', 'public_rental_units', 'private_rental_units',
  'public_rental_ratio',
].join(',')

class DataCache {
  private cache = new Map<string, { data: School[] | RegionData[]; timestamp: number }>()
  private readonly ttl = 30 * 60 * 1000

  get(key: string) {
    const entry = this.cache.get(key)
    if (!entry || Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: School[] | RegionData[]) {
    this.cache.set(key, { data, timestamp: Date.now() })
    if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value as string)
  }

  clear() {
    this.cache.clear()
  }
}

const dataCache = new DataCache()
const matchingSchoolCache = new Map<string, { ids: Set<string>; count: number; timestamp: number }>()
let crossFilterRpcAvailable: boolean | null = null

const SCHOOL_TYPE_VALUES: Record<FilterState['school_types'][number], string> = {
  public: '공립',
  private: '사립',
  national: '국립',
}

export const hasApartmentFilters = (filters: FilterState) => (
  filters.min_households > 0
  || filters.min_parking_ratio > 0
  || filters.max_apartment_age < UNLIMITED_APARTMENT_AGE
  || filters.max_public_rental_ratio < 100
)

const matchingSchoolParams = (filters: FilterState) => ({
  p_target_grade: filters.target_grade,
  p_min_students: filters.min_students,
  p_school_types: filters.school_types.map((type) => SCHOOL_TYPE_VALUES[type]),
  p_regions: filters.selected_cities.length ? filters.selected_cities : null,
  p_districts: filters.selected_districts.length ? filters.selected_districts : null,
  p_apply_apartment_filters: hasApartmentFilters(filters),
  p_min_households: filters.min_households,
  p_min_parking_ratio: filters.min_parking_ratio,
  p_min_use_approval_year: filters.max_apartment_age < UNLIMITED_APARTMENT_AGE
    ? new Date().getFullYear() - filters.max_apartment_age
    : null,
  p_max_public_rental_ratio: filters.max_public_rental_ratio,
})

const matchingSchoolKey = (filters: FilterState) => JSON.stringify(matchingSchoolParams(filters))

const isMissingCrossFilterRpc = (error: { code?: string; message?: string }) => (
  error.code === 'PGRST202'
  || error.code === '42883'
  || Boolean(error.message?.includes('filter_school_ids'))
)

const fetchMatchingSchoolSet = async (filters: FilterState) => {
  const cacheKey = matchingSchoolKey(filters)
  const cached = matchingSchoolCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached
  if (crossFilterRpcAvailable === false) return null

  const ids = new Set<string>()
  let totalCount = 0
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .rpc('filter_school_ids', matchingSchoolParams(filters))
      .range(start, start + 999)
    if (error) {
      if (isMissingCrossFilterRpc(error)) {
        crossFilterRpcAvailable = false
        return null
      }
      throw error
    }
    crossFilterRpcAvailable = true
    const rows = (data || []) as Array<{ school_id: string; total_count: number | string }>
    rows.forEach((row) => ids.add(String(row.school_id)))
    if (rows[0]) totalCount = Number(rows[0].total_count) || 0
    if (rows.length < 1000) break
  }

  const result = { ids, count: totalCount, timestamp: Date.now() }
  matchingSchoolCache.set(cacheKey, result)
  return result
}

export const getFilteredSchoolCount = async (filters: FilterState): Promise<number | null> => {
  const cached = matchingSchoolCache.get(matchingSchoolKey(filters))
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached.count
  if (crossFilterRpcAvailable === false) return null

  try {
    const { data, error } = await supabase
      .rpc('filter_school_ids', matchingSchoolParams(filters))
      .limit(1)
    if (error) {
      if (isMissingCrossFilterRpc(error)) {
        crossFilterRpcAvailable = false
        return null
      }
      throw error
    }
    crossFilterRpcAvailable = true
    const rows = (data || []) as Array<{ total_count: number | string }>
    return rows[0] ? Number(rows[0].total_count) || 0 : 0
  } catch (error) {
    console.warn('교차 필터 결과 수 조회 실패:', error)
    return null
  }
}

const applyCrossDomainFilter = async (schools: School[], filters: FilterState) => {
  if (!hasApartmentFilters(filters)) return schools
  const matching = await fetchMatchingSchoolSet(filters)
  return matching ? schools.filter((school) => matching.ids.has(school.school_id)) : schools
}

const numberValue = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const addressParts = (address: string) => {
  const parts = address.trim().split(/\s+/)
  const isGyeonggi = parts[0] === '경기도'
  const city = isGyeonggi ? parts[1] || '' : parts[0] || ''
  const subDistrict = isGyeonggi && /구$/.test(parts[2] || '') ? parts[2] : ''

  return {
    city,
    district: isGyeonggi
      ? [city, subDistrict].filter(Boolean).join(' ')
      : parts[1] || '',
  }
}

const getNeighborhood = (legalAddress: string) => (
  legalAddress.trim().split(/\s+/).find((part) => /(?:동|읍|면|가)$/.test(part)) || ''
)

const toSchool = (row: SchoolMasterRow): School => {
  const address = String(row.road_address || row.legal_address || '')
  const legalAddress = String(row.legal_address || '')
  const parts = addressParts(address)
  const region = String(row.region || address.split(/\s+/)[0] || '')
  return {
    school_id: String(row.school_id),
    school_name: String(row.school_name || ''),
    school_type: String(row.school_type || '초등학교'),
    address,
    address_old: row.legal_address ? String(row.legal_address) : undefined,
    region,
    province: region,
    city: parts.city,
    district: parts.district,
    neighborhood: getNeighborhood(legalAddress),
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    establishment_date: row.establishment_date ? String(row.establishment_date) : undefined,
    establishment_type: row.establishment_type ? String(row.establishment_type) : undefined,
    operation_status: row.operation_status ? String(row.operation_status) : undefined,
    education_office: row.education_office ? String(row.education_office) : undefined,
    education_support_office: row.education_support_office ? String(row.education_support_office) : undefined,
    homepage: row.homepage ? String(row.homepage) : null,
    phone: row.phone ? String(row.phone) : null,
    grade1_students: numberValue(row.grade1_students),
    grade2_students: numberValue(row.grade2_students),
    grade3_students: numberValue(row.grade3_students),
    grade4_students: numberValue(row.grade4_students),
    grade5_students: numberValue(row.grade5_students),
    grade6_students: numberValue(row.grade6_students),
    grade1_classes: numberValue(row.grade1_classes),
    grade2_classes: numberValue(row.grade2_classes),
    grade3_classes: numberValue(row.grade3_classes),
    grade4_classes: numberValue(row.grade4_classes),
    grade5_classes: numberValue(row.grade5_classes),
    grade6_classes: numberValue(row.grade6_classes),
    grade1_per_class: numberValue(row.grade1_per_class),
    grade2_per_class: numberValue(row.grade2_per_class),
    grade3_per_class: numberValue(row.grade3_per_class),
    grade4_per_class: numberValue(row.grade4_per_class),
    grade5_per_class: numberValue(row.grade5_per_class),
    grade6_per_class: numberValue(row.grade6_per_class),
    total_students: numberValue(row.total_students),
    teachers: numberValue(row.teachers),
    keris_matched: Boolean(row.student_data_status),
    reference_date: row.reference_date ? String(row.reference_date) : undefined,
    student_statistics_year: numberValue(row.student_statistics_year) || undefined,
    student_data_status: row.student_data_status ? String(row.student_data_status) : undefined,
    school_size_category: numberValue(row.grade1_students) >= 80 ? 'large' : 'small',
    coordinates_valid: row.latitude != null && row.longitude != null,
  }
}

const establishmentTypeAllowed = (school: School, filters: FilterState) => {
  const typeMap: Record<string, FilterState['school_types'][number]> = {
    공립: 'public',
    사립: 'private',
    국립: 'national',
  }
  const type = typeMap[school.establishment_type || '']
  return !type || filters.school_types.includes(type)
}

export const fetchRegionData = async (
  bounds: MapBounds,
  zoomLevel: number,
  filters: FilterState,
): Promise<School[] | RegionData[]> => {
  const cacheKey = generateCacheKey(
    bounds,
    zoomLevel,
    filters.target_grade,
    filters.min_students,
    JSON.stringify({
      schoolTypes: filters.school_types,
      cities: filters.selected_cities,
      districts: filters.selected_districts,
      apartments: {
        minHouseholds: filters.min_households,
        minParkingRatio: filters.min_parking_ratio,
        maxAge: filters.max_apartment_age,
        maxPublicRentalRatio: filters.max_public_rental_ratio,
      },
    }),
  )
  const cached = dataCache.get(cacheKey)
  if (cached) return cached

  const data = getDisplayMode(zoomLevel) === 'SCHOOLS'
    ? await fetchSchoolDetailData(bounds, filters)
    : await fetchRegionAggregatedData(filters)
  dataCache.set(cacheKey, data)
  return data
}

export const fetchRegionAggregatedData = async (filters: FilterState): Promise<RegionData[]> => {
  const rows: SchoolMasterRow[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('school_master')
      .select('school_id,road_address,legal_address,region,total_students,student_data_status,establishment_type')
      .range(start, start + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }

  const stats = new Map<string, { schools: number; students: number; observed: number }>()
  rows.map(toSchool).filter((school) => establishmentTypeAllowed(school, filters)).forEach((school) => {
    const current = stats.get(school.region) || { schools: 0, students: 0, observed: 0 }
    current.schools += 1
    current.students += school.total_students
    if (school.student_data_status) current.observed += 1
    stats.set(school.region, current)
  })

  return Array.from(stats, ([region, value]) => ({
    region,
    region_name: region,
    total_schools: value.schools,
    total_students: value.students,
    avg_students_per_school: value.schools ? value.students / value.schools : 0,
    keris_integration_rate: value.schools ? value.observed / value.schools * 100 : 0,
    center: getRegionCenter(region),
  }))
}

export const fetchSchoolDetailData = async (bounds: MapBounds, filters: FilterState): Promise<School[]> => {
  const gradeColumn = `grade${filters.target_grade}_students`
  let query = supabase
    .from('school_master')
    .select(SCHOOL_SELECT_FIELDS)
    .gte('latitude', bounds.southwest.lat)
    .lte('latitude', bounds.northeast.lat)
    .gte('longitude', bounds.southwest.lng)
    .lte('longitude', bounds.northeast.lng)
    .gte(gradeColumn, filters.min_students)

  if (filters.selected_cities.length) query = query.in('region', filters.selected_cities)
  const { data, error } = await query.limit(1000)
  if (error) throw error
  const rows = (data || []) as unknown as SchoolMasterRow[]
  const schools = rows.map(toSchool).filter((school) => establishmentTypeAllowed(school, filters))
  return applyCrossDomainFilter(schools, filters)
}

export const fetchDistrictOverviewData = async (filters: FilterState): Promise<School[]> => {
  const gradeColumn = `grade${filters.target_grade}_students`
  const cacheKey = `district-overview_${JSON.stringify({
    grade: filters.target_grade,
    minStudents: filters.min_students,
    schoolTypes: filters.school_types,
    cities: filters.selected_cities,
    districts: filters.selected_districts,
    minHouseholds: filters.min_households,
    minParkingRatio: filters.min_parking_ratio,
    maxApartmentAge: filters.max_apartment_age,
    maxPublicRentalRatio: filters.max_public_rental_ratio,
  })}`
  const cached = dataCache.get(cacheKey)
  if (cached) return cached as School[]

  const rows: SchoolMasterRow[] = []
  for (let start = 0; ; start += 1000) {
    let query = supabase
      .from('school_master')
      .select([
        'school_id', 'school_name', 'school_type', 'road_address', 'legal_address', 'region',
        'latitude', 'longitude', 'establishment_type', gradeColumn,
      ].join(','))
      .gte(gradeColumn, filters.min_students)

    if (filters.selected_cities.length) query = query.in('region', filters.selected_cities)
    const { data, error } = await query.range(start, start + 999)
    if (error) throw error
    rows.push(...((data || []) as unknown as SchoolMasterRow[]))
    if (!data || data.length < 1000) break
  }

  const schoolCandidates = rows
    .map(toSchool)
    .filter((school) => establishmentTypeAllowed(school, filters))
    .filter((school) => filters.selected_districts.length === 0 || filters.selected_districts.includes(school.district || ''))
  const schools = await applyCrossDomainFilter(schoolCandidates, filters)
  dataCache.set(cacheKey, schools)
  return schools
}

export const fetchSchoolsByAdministrativeArea = async (
  region: string,
  district: string,
  neighborhood: string | null,
  filters: FilterState,
): Promise<School[]> => {
  const gradeColumn = `grade${filters.target_grade}_students`
  let query = supabase
    .from('school_master')
    .select(SCHOOL_SELECT_FIELDS)
    .eq('region', region)
    .or(`legal_address.ilike.%${district}%,road_address.ilike.%${district}%`)
    .gte(gradeColumn, filters.min_students)

  const { data, error } = await query.limit(1000)
  if (error) throw error
  const schools = ((data || []) as unknown as SchoolMasterRow[])
    .map(toSchool)
    .filter((school) => establishmentTypeAllowed(school, filters))
    .filter((school) => school.district === district)
    .filter((school) => !neighborhood || getSchoolNeighborhoodLabel(school) === neighborhood)
  return applyCrossDomainFilter(schools, filters)
}

export const fetchSchoolsByIds = async (
  schoolIds: string[],
  filters: FilterState,
): Promise<School[]> => {
  if (schoolIds.length === 0) return []

  const gradeColumn = `grade${filters.target_grade}_students`
  const { data, error } = await supabase
    .from('school_master')
    .select(SCHOOL_SELECT_FIELDS)
    .in('school_id', schoolIds)
    .gte(gradeColumn, filters.min_students)
    .limit(1000)

  if (error) throw error
  const schools = ((data || []) as unknown as SchoolMasterRow[])
    .map(toSchool)
    .filter((school) => establishmentTypeAllowed(school, filters))
  return applyCrossDomainFilter(schools, filters)
}

export const searchSchoolsByName = async (searchTerm: string, region?: string): Promise<School[]> => {
  let query = supabase.from('school_master').select(SCHOOL_SELECT_FIELDS).ilike('school_name', `%${searchTerm}%`)
  if (region) query = query.eq('region', region)
  const { data, error } = await query.limit(20)
  if (error) throw error
  return ((data || []) as unknown as SchoolMasterRow[]).map(toSchool)
}

export const getSchoolDetail = async (schoolId: string): Promise<School | null> => {
  const { data, error } = await supabase.from('school_master').select(SCHOOL_SELECT_FIELDS).eq('school_id', schoolId).maybeSingle()
  if (error) throw error
  return data ? toSchool(data as unknown as SchoolMasterRow) : null
}

export const getAllRegionsSummary = async (): Promise<RegionData[]> => fetchRegionAggregatedData({
  target_grade: 1,
  min_students: 0,
  school_types: ['public', 'private', 'national'],
  min_parking_ratio: 0,
  max_apartment_age: UNLIMITED_APARTMENT_AGE,
  max_public_rental_ratio: 100,
  min_households: 0,
  selected_cities: [],
  selected_districts: [],
})

export const getApartmentsNearSchool = async (
  schoolId: string,
  filters?: FilterState,
): Promise<Apartment[]> => {
  const currentYear = new Date().getFullYear()
  let query = supabase
    .from('school_apartment_serving')
    .select(APARTMENT_SELECT_FIELDS)
    .eq('school_id', schoolId)
    .order('households', { ascending: false, nullsFirst: false })
    .order('complex_name')
  if (filters) {
    if (filters.min_households > 0) {
      query = query.gte('households', filters.min_households)
    }
    if (filters.min_parking_ratio > 0) {
      query = query.gte('parking_per_household', filters.min_parking_ratio)
    }
    if (filters.max_apartment_age < UNLIMITED_APARTMENT_AGE) {
      query = query.gte('use_approval_year', currentYear - filters.max_apartment_age)
    }
    if (filters.max_public_rental_ratio < 100) {
      query = query.lte('public_rental_ratio', filters.max_public_rental_ratio)
    }
  }
  const { data, error } = await query.limit(1000)
  if (error) throw error

  return ((data || []) as unknown as ApartmentServingRow[]).map((row): Apartment => {
    const households = numberValue(row.households)
    const builtYear = numberValue(row.use_approval_year)
    const parkingTotal = numberValue(row.parking_total)
    return {
      id: String(row.canonical_complex_id),
      name: String(row.complex_name || ''),
      address: String(row.road_address || ''),
      district: String(row.district || ''),
      city: String(row.region || ''),
      latitude: numberValue(row.latitude),
      longitude: numberValue(row.longitude),
      households,
      built_year: builtYear,
      age: builtYear ? currentYear - builtYear : 0,
      parking_total: parkingTotal,
      parking_per_household: numberValue(row.parking_per_household),
      underground_parking: numberValue(row.parking_underground),
      ground_parking: numberValue(row.parking_ground),
      public_rental_units: numberValue(row.public_rental_units),
      public_rental_ratio: numberValue(row.public_rental_ratio),
      private_rental_units: numberValue(row.private_rental_units),
      rental_units_total: numberValue(row.rental_units_total),
      sale_households: numberValue(row.sale_households),
      assigned_school_id: schoolId,
      assigned_school_name: String(row.school_name || ''),
    }
  })
}

const getRegionCenter = (region: string): Coordinates => ({
  서울특별시: { lat: 37.5665, lng: 126.9780 },
  경기도: { lat: 37.4138, lng: 127.5183 },
  인천광역시: { lat: 37.4563, lng: 126.7052 },
}[region] || { lat: 37.5, lng: 127.0 })

export const clearDataCache = () => {
  dataCache.clear()
  matchingSchoolCache.clear()
}
