import type { MorningCareInfo, SchoolEscortInfo } from '../../types/morningCare'
import { morningCareStatusLabel } from '../../utils/morningCare'

/** 운영시간이 이르거나 학교가 가까워도 아침돌봄·등교 동행을 추론하지 않는다. */
export default function CareCenterMorningInfo({ morning, escort, compact = false }: {
  morning?: MorningCareInfo
  escort?: SchoolEscortInfo
  compact?: boolean
}) {
  return <div className="mt-2 text-xs text-gray-600" data-testid="center-morning-care">
    <p>아침돌봄 · {morning ? morningCareStatusLabel[morning.status] : '미확인'}</p>
    <p>등교 동행 · {escort?.status === 'available' ? '제공 확인' : escort?.status === 'unavailable' ? '미제공 확인' : '미확인'}</p>
    {!compact && <>
      {morning?.startTime && <p>아침 운영 {morning.startTime} ~ {morning.endTime ?? '종료 미확인'}</p>}
      <p>{escort?.conditions ?? '동행 대상 학교·학년·요일·인계 장소·추가 비용은 센터 확인 필요'}</p>
      <p>아침 출처: {morning?.source ?? '미확인'} · 기준 학년도: {morning?.schoolYear ?? '미확인'}</p>
      <p>동행 출처: {escort?.source ?? '미확인'} · 기준 학년도: {escort?.schoolYear ?? '미확인'}</p>
      <p>학기 중 운영시간만으로 아침돌봄이나 등교 동행 여부를 판단하지 않아요.</p>
    </>}
  </div>
}
