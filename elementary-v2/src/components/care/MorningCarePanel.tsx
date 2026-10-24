import type { MorningCareInfo } from '../../types/morningCare'
import { morningCareStatusLabel, unknownMorningCare } from '../../utils/morningCare'

/**
 * 등교시각과 아침돌봄 한 줄(2026-10-24). 대상학년·신청·출처는 학교 상세 하단 출처 줄과 가이드에서 본다 —
 * 상자가 하루 카드 첫머리를 다 차지했다. 출처와 기준 학년도는 title로 남긴다.
 */
export default function MorningCarePanel({ info = unknownMorningCare(), state = 'ready' }: {
  info?: MorningCareInfo
  state?: 'loading' | 'ready' | 'error'
}) {
  const hours = info.startTime || info.endTime ? ` ${info.startTime ?? '?'}~${info.endTime ?? '?'}` : ''
  const provenance = `출처: ${info.source ?? '미확인'} · 기준 학년도: ${info.schoolYear ? `${info.schoolYear}학년도` : '미확인'}`
  return <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm" data-testid="school-morning-care" aria-busy={state === 'loading'} title={provenance}>
    {state === 'loading' ? <p className="text-xs text-gray-600" role="status">아침돌봄 자료 확인 중…</p>
      : state === 'error' ? <p className="text-xs text-gray-700" role="status">아침돌봄 자료를 불러오지 못했어요. 학교에 확인해 주세요.</p>
      : <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex gap-1.5"><dt className="text-gray-600">등교시각</dt><dd className="font-semibold text-gray-950">{info.arrivalTime ?? '미확인'}</dd></div>
        <div className="flex gap-1.5"><dt className="text-gray-600">아침돌봄</dt><dd className="font-semibold text-gray-950">{morningCareStatusLabel[info.status]}{hours}</dd></div>
      </dl>}
  </div>
}
