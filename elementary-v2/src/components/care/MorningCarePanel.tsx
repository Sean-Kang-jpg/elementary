import type { MorningCareInfo } from '../../types/morningCare'
import { morningCareStatusLabel, publicInfoUrl, unknownMorningCare } from '../../utils/morningCare'

export default function MorningCarePanel({ info = unknownMorningCare(), state = 'ready' }: {
  info?: MorningCareInfo
  state?: 'loading' | 'ready' | 'error'
}) {
  const sourceUrl = publicInfoUrl(info.sourceUrl)
  const applicationUrl = publicInfoUrl(info.applicationUrl)
  return <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 p-3" data-testid="school-morning-care" aria-busy={state === 'loading'}>
    <h4 className="text-sm font-semibold text-gray-950">등교 전·아침돌봄</h4>
    {state === 'loading' ? <p className="mt-2 text-xs text-gray-600" role="status">아침돌봄 자료 확인 중…</p> : <>
      {state === 'error' && <p className="mt-2 text-xs text-gray-700" role="status">자료를 불러오지 못했어요. 운영 여부는 학교에 확인해 주세요.</p>}
      <dl className="mt-2 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-gray-600">등교시각</dt><dd>{info.arrivalTime ?? '미확인'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-600">아침돌봄</dt><dd className="font-semibold">{morningCareStatusLabel[info.status]}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-600">시작·종료</dt><dd>{info.startTime ?? '미확인'} ~ {info.endTime ?? '미확인'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="shrink-0 text-gray-600">대상학년</dt><dd className="text-right">{info.grades ?? '아침돌봄 대상 미확인'}</dd></div>
        <div><dt className="text-gray-600">신청 정보</dt><dd>{info.application ?? '신청 기간·방법·선정 조건은 학교 확인 필요'}{applicationUrl && <> · <a href={applicationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">신청 안내 원문</a></>}</dd></div>
      </dl>
      {info.rawHours && !info.startTime && <p className="mt-2 text-xs text-gray-600">기존 자료 표기: {info.rawHours} · 시간 확인 필요</p>}
      <p className="mt-2 text-[11px] leading-4 text-gray-600">출처: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{info.source ?? '원문'}</a> : info.source ?? '미확인'} · 기준 학년도: {info.schoolYear ? `${info.schoolYear}학년도` : '미확인'}{info.checkedOn ? ` · 확인일 ${info.checkedOn}` : ''}</p>
      <p className="mt-1 text-[11px] leading-4 text-gray-600">미확인은 미운영을 뜻하지 않아요. 운영시간 기재는 현재 운영·신청 가능·참여 확정과 별개예요.</p>
    </>}
  </div>
}
