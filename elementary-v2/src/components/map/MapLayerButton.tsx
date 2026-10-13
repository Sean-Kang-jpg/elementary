import { Building2, Check, GraduationCap, HeartHandshake, LoaderCircle, MapPin } from 'lucide-react'
import { useAppContext } from '../../contexts/AppContext'
import { hasAcademyData } from '../../utils/academyCoverage'
import type { MapLayer } from '../../utils/mapLayers'

const LAYERS = {
  apartments: { label: '배정아파트', icon: Building2, note: '세대수 표시 · 100세대 미만은 작은 아이콘' },
  care: { label: '돌봄센터', icon: HeartHandshake, note: '학교 기준 직선거리 1km' },
  activity: { label: '교육환경', icon: GraduationCap, note: '학원 등 · 실선 ~600m / 점선 600~800m · +N 복합상가' },
} as const

interface MapLayerButtonProps {
  layer: MapLayer
  variant?: 'floating' | 'banner'
  loading?: boolean
  status?: string
  onEnable?: () => void
}

/** Both entry points read and update exactly the same visibility state. */
export default function MapLayerButton({ layer, variant = 'floating', loading = false, status, onEnable }: MapLayerButtonProps) {
  const { state, dispatch } = useAppContext()
  const hasSchool = Boolean(state.selectedSchool)
  const hasOrigin = Boolean(state.selectedSchool || state.selectedApartment)
  const hasCareOrigin = Boolean(state.selectedSchool?.latitude && state.selectedSchool?.longitude)
  const academyAvailable = hasAcademyData(state.selectedApartment?.city || state.selectedSchool?.region)
  const available = layer === 'apartments' ? hasSchool : layer === 'care' ? hasCareOrigin : hasOrigin && academyAvailable
  const enabled = available && state.mapLayers[layer]
  const { label, icon: Icon, note } = LAYERS[layer]
  const unavailableReason = layer === 'activity' && hasOrigin && !academyAvailable ? '이 지역 데이터 준비 중'
    : layer === 'activity' ? '학교나 아파트를 먼저 선택하세요' : '학교를 먼저 선택하세요'
  const explanation = !available ? unavailableReason : loading && enabled ? '조회 중' : enabled && status ? status : note
  const bannerNote = layer === 'activity' ? '핵심 ~600m · 확장 600~800m' : layer === 'apartments' ? '배정 단지 · 세대수 표시' : note
  const failed = enabled && status?.startsWith('조회 실패')

  return <button type="button" data-map-layer={layer} data-layer-entry={variant}
    className={`map-layer-button map-layer-button--${layer} map-layer-button--${variant}`}
    aria-label={`${label} 지도 표시${!available ? ` · ${unavailableReason}` : ''}`} aria-pressed={enabled}
    aria-busy={loading && enabled} disabled={!available} title={`${label} · ${explanation}`}
    onClick={() => {
      if (!enabled) onEnable?.()
      dispatch({ type: 'SET_MAP_LAYER', payload: { layer, enabled: !enabled } })
    }}>
    {loading && enabled ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}
    <span className="map-layer-button__text"><strong>{label}</strong>
      {variant === 'banner' ? <small>{!available ? unavailableReason : enabled ? `지도 표시 중 · ${bannerNote}` : bannerNote}</small>
        : failed ? <small>조회 실패</small> : null}
    </span>
    {variant === 'banner' ? <span className="map-layer-button__action"><MapPin size={14} aria-hidden="true" />{enabled ? '표시 끄기' : '지도에 표시'}</span>
      : enabled ? <Check size={13} aria-hidden="true" /> : <span className="map-layer-button__unchecked" aria-hidden="true" />}
  </button>
}
