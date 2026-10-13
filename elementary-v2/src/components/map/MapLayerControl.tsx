import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import MapLayerButton from './MapLayerButton'

interface MapLayerControlProps {
  academyCount: number | null
  careStatus: 'idle' | 'loading' | 'ready' | 'error'
  careCount: number
}

export default function MapLayerControl({ academyCount, careStatus, careCount }: MapLayerControlProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false)

  return <div className="map-layer-control-shell">
    <button type="button" className="map-layer-disclosure" aria-controls="map-layer-options"
      aria-expanded={mobileExpanded} onClick={() => setMobileExpanded((expanded) => !expanded)}>
      <SlidersHorizontal size={16} aria-hidden="true" />
      <span>표시 필터</span>
      <ChevronDown className="map-layer-disclosure__chevron" size={15} aria-hidden="true" />
    </button>
    <div id="map-layer-options" className="map-layer-controls" role="group" aria-label="지도 정보 표시"
      data-mobile-expanded={mobileExpanded ? 'true' : 'false'}>
      <MapLayerButton layer="apartments" />
      <MapLayerButton layer="care" loading={careStatus === 'loading'}
        status={careStatus === 'error' ? '조회 실패 · 껐다 켜서 재시도' : careStatus === 'ready' ? `학교 기준 1km · 조회 결과 ${careCount}곳` : undefined} />
      <MapLayerButton layer="activity" loading={academyCount === -1}
        status={academyCount === -2 ? '조회 실패 · 껐다 켜서 재시도' : academyCount !== null && academyCount >= 0 ? `전체 분야 조회 ${academyCount}곳 · 초등 대상 별도 확인` : undefined} />
    </div>
  </div>
}
