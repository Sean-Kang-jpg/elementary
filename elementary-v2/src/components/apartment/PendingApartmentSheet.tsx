import React from 'react'
import { School } from 'lucide-react'
import BottomSheet from '../ui/BottomSheet'
import type { ResolvedApartmentKey } from '../../services/dataService'

interface PendingApartmentSheetProps {
  apartment: ResolvedApartmentKey
  isOpen: boolean
  onClose: () => void
}

/**
 * 공개 주소는 있지만 배정 학교가 아직 연결되지 않은 단지(SQL 43의 `pending`).
 * 신축·재건축 단지가 학구도 자료와 아직 맞지 않은 경우다. 추정 배정을 보여주면
 * 공식 배정처럼 읽히므로, 준비 중이라고만 말하고 지도에서 주변 학교를 보게 한다.
 */
const PendingApartmentSheet: React.FC<PendingApartmentSheetProps> = ({ apartment, isOpen, onClose }) => (
  <BottomSheet
    isOpen={isOpen}
    onClose={onClose}
    title={apartment.complex_name || '아파트'}
    snapPoints={[0.11, 0.38, 0.6]}
    defaultSnap={1}
    swipeDownBehavior="minimize"
  >
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-3" data-testid="pending-apartment">
      {apartment.road_address ? <p className="text-sm text-gray-600">{apartment.road_address}</p> : null}
      {apartment.households ? <p className="text-sm text-gray-700">{apartment.households.toLocaleString()}세대</p> : null}
      <section className="border-y border-gray-200 py-3" aria-labelledby="pending-school-title">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-gray-100 text-gray-500"><School size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span id="pending-school-title" className="block text-xs font-medium text-gray-500">배정 학교</span>
            <strong className="mt-0.5 block text-base text-gray-950">배정 정보 준비 중</strong>
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          이 단지는 아직 통학구역 자료와 연결되지 않아 배정 초등학교를 보여드리지 못합니다.
          자료가 갱신되어 연결되면 이 주소에서 바로 확인할 수 있어요. 그 전에는 관할 교육지원청에 확인하세요.
        </p>
      </section>
      <button type="button" onClick={onClose} className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50">
        지도에서 주변 학교 보기
      </button>
    </div>
  </BottomSheet>
)

export default PendingApartmentSheet
