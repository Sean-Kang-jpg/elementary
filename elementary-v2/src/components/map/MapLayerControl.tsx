import MapLayerButton from './MapLayerButton'

interface MapLayerControlProps {
  academyCount: number | null
  careStatus: 'idle' | 'loading' | 'ready' | 'error'
  careCount: number
}

export default function MapLayerControl({ academyCount, careStatus, careCount }: MapLayerControlProps) {
  return <div className="map-layer-controls" role="group" aria-label="지도 정보 표시">
    <MapLayerButton layer="apartments" />
    <MapLayerButton layer="care" loading={careStatus === 'loading'}
      status={careStatus === 'error' ? '조회 실패 · 껐다 켜서 재시도' : careStatus === 'ready' ? `학교 기준 1km · 조회 결과 ${careCount}곳` : undefined} />
    <MapLayerButton layer="activity" loading={academyCount === -1}
      status={academyCount === -2 ? '조회 실패 · 껐다 켜서 재시도' : academyCount !== null && academyCount >= 0 ? `전체 분야 조회 ${academyCount}곳 · 초등 대상 별도 확인` : undefined} />
  </div>
}
