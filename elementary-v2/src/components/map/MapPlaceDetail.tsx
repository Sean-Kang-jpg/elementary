import { useState } from 'react'
import { useAppContext } from '../../contexts/AppContext'
import type { SelectedMapPlace } from '../../utils/mapTopics'
import { getInstitutionCategories } from '../../utils/academyCategories'
import BottomSheet from '../ui/BottomSheet'
import DetailTabs from '../ui/DetailTabs'
import DataFreshness from '../ui/DataFreshness'
import CareCenterMorningInfo from '../care/CareCenterMorningInfo'
import AcademyTimetableForm from './AcademyTimetableForm'

export default function MapPlaceDetail({ place, onNavigate }: { place: SelectedMapPlace; onNavigate: (path: string) => void }) {
  const { dispatch } = useAppContext()
  const [tab, setTab] = useState<'overview' | 'source'>('overview')
  const [snap, setSnap] = useState(1)
  // 시간표에 담는 양식을 연 학원(목록 순번)과 담은 뒤의 안내.
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<{ index: number; message: string } | null>(null)
  const isCare = place.kind === 'care'
  const title = isCare ? place.data.name : `배움·활동 시설 ${place.data.institution_count}곳`
  return (
    <BottomSheet isOpen onClose={() => dispatch({ type: 'SET_SELECTED_MAP_PLACE', payload: null })}
      title={title} historyKey="map-place" snapPoints={[0.11, 0.45, 0.7, 0.88]} defaultSnap={1}
      swipeDownBehavior="minimize" onSnapChange={setSnap}>
      {snap !== 0 && <div className="space-y-4 px-4 py-3" data-testid="map-place-detail">
        <DetailTabs label={isCare ? '돌봄센터 상세 메뉴' : '활동시설 상세 메뉴'} value={tab} onChange={setTab}
          tabs={[{ key: 'overview', label: isCare ? '운영·이용 안내' : '시설·분야' }, { key: 'source', label: '출처·확인' }]} />
        {place.kind === 'care' ? tab === 'overview' ? <>
          <p className="text-sm text-gray-600">{place.data.center_kind} · 학교 기준 직선거리 {place.data.straight_distance_m.toLocaleString()}m</p>
          <p className="text-sm">{place.data.address} {place.data.address_detail}</p>
          <dl className="space-y-2 rounded-md border border-gray-200 p-3 text-sm">
            <div><dt className="text-gray-500">시설 정원</dt><dd>{place.data.capacity == null ? '미확인' : `${place.data.capacity}명`}</dd></div>
            <div><dt className="text-gray-500">학기 중 운영시간</dt><dd>{place.data.term_hours?.replace('~', ' ~ ') ?? '미확인'}</dd></div>
            <div><dt className="text-gray-500">방학 중 운영시간</dt><dd>{place.data.vacation_hours?.replace('~', ' ~ ') ?? '미확인'}</dd></div>
          </dl>
          <CareCenterMorningInfo />
          <p className="text-xs text-gray-600">시설 정원은 현재 여석을 뜻하지 않습니다. 모집·예약기간과 신청 경로는 센터에 확인해 주세요.</p>
          {place.data.phone && <a href={`tel:${place.data.phone}`} className="inline-block rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-900">센터 전화 {place.data.phone}</a>}
        </> : <>
          <p className="text-sm">출처: 다함께돌봄사업 지원단 센터 현황 · 센터가 직접 입력한 정보</p>
          <p className="text-sm">원천 정보 수정일: {place.data.source_updated_on ?? '미확인'}</p>
          <p className="text-sm">별도 운영 확인일: 미확인</p>
          <p className="text-xs text-gray-600">원천 수정일은 이번에 운영 여부를 검증한 날짜와 다릅니다. 이용 전 최신 정보를 확인해 주세요.</p>
          <a className="text-sm text-blue-700 underline" href="https://dadol.or.kr/board/center/list" target="_blank" rel="noopener noreferrer">공식 센터 현황 확인</a>
        </> : tab === 'overview' ? <>
          <p className="text-sm text-gray-600">{place.data.region} {place.data.district} · 직선거리 {place.data.straight_distance_m.toLocaleString()}m</p>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {place.data.institutions.map((institution, index) => (
              <li key={`${institution.name}-${index}`} className="space-y-1 px-3 py-2.5">
                <strong className="block text-sm">{institution.name || '기관명 미확인'}</strong>
                <div className="flex flex-wrap gap-1">{getInstitutionCategories(institution).map((category) => (
                  <span key={category.key} className="rounded-full px-2 py-0.5 text-xs" style={{ color: category.color, backgroundColor: category.softColor }}>{category.label}</span>
                ))}</div>
                <small className="text-gray-500">{[institution.type, institution.realm].filter(Boolean).join(' · ')}</small>
                {institution.name && (
                  <button type="button" className="map-academy-add" aria-expanded={adding === index}
                    onClick={() => { setAdded(null); setAdding(adding === index ? null : index) }}>내 시간표에 추가</button>
                )}
                {adding === index && (
                  <AcademyTimetableForm label={`${getInstitutionCategories(institution)[0]?.label ?? '학원'} · ${institution.name}`}
                    providerKey={institution.key} onNavigate={onNavigate}
                    onDone={(message) => { setAdding(null); setAdded({ index, message }) }} />
                )}
                {added?.index === index && <p className="map-academy-form__done" role="status">{added.message}</p>}
              </li>
            ))}
          </ul>
          {!place.data.institutions.length && <p className="text-sm text-gray-600">기관명 정보 확인 중입니다.</p>}
          <p className="text-xs text-gray-600">초등학생 대상 강좌와 모집 여부는 기관에 확인하세요. 시간표에 담아도 학원 신청이 되지는 않아요.</p>
        </> : <>
          <p className="text-sm">출처: NEIS 학원·교습소정보 및 체육도장업 인허가</p>
          <p className="text-xs text-gray-600">분야는 기관명·공시 분류를 바탕으로 나눈 참고 정보이며 초등 대상 강좌의 확정 분류가 아닙니다. 직선거리는 단지 중심 또는 동별 좌표를 기준으로 계산합니다.</p>
          <DataFreshness sources={['neis-academy']} />
        </>}
      </div>}
    </BottomSheet>
  )
}
