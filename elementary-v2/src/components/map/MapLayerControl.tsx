import { ChevronDown, Filter, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useAppContext, useUI } from '../../contexts/AppContext'
import { ACADEMY_CATEGORIES } from '../../utils/academyCategories'
import { hasAcademyData } from '../../utils/academyCoverage'
import MapLayerButton from './MapLayerButton'

interface MapLayerControlProps {
  academyCount: number | null
  careStatus: 'idle' | 'loading' | 'ready' | 'error'
  careCount: number
}

/** 상세 필터와 표시 필터. 퀵필터를 숨긴 동안(2026-11-01) MY 버튼 바로 아래에 둔다. */
export default function MapLayerControl({ academyCount, careStatus, careCount }: MapLayerControlProps) {
  const { state, dispatch } = useAppContext()
  const { ui, toggleSidebar } = useUI()
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const hasOrigin = Boolean(state.selectedSchool || state.selectedApartment)
  const showSubjects = hasOrigin && state.mapLayers.activity
    && hasAcademyData(state.selectedApartment?.city || state.selectedSchool?.region)

  return <div className="map-layer-control-shell">
    <button type="button" className="map-filter-open" onClick={toggleSidebar}
      aria-controls="filter-sidebar" aria-expanded={ui.sidebar_open}>
      <Filter size={16} aria-hidden="true" />
      <span>상세 필터</span>
    </button>
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
      {showSubjects && <label className="map-layer-subfilter">
        <select aria-label="교육환경 과목" value={state.activityCategory ?? ''}
          onChange={(event) => dispatch({ type: 'SET_ACTIVITY_CATEGORY', payload: ACADEMY_CATEGORIES.find(({ key }) => key === event.target.value)?.key ?? null })}>
          <option value="">전체 과목</option>
          {ACADEMY_CATEGORIES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>}
    </div>
  </div>
}
