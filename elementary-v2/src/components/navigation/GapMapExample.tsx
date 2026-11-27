import { Plus } from 'lucide-react'

/**
 * 학교를 고르기 전 첫 화면의 예시(C안, 2026-11-27 대표님 의견). 실제 시간표가 어떻게 생기는지 그림으로만 보인다 —
 * 편집·저장과 연결하지 않고(누를 수 있는 요소 없음), 설명 문장 없이 '예시' 표시만 둔다. 시각과 활동은 시연값이다.
 */
const FROM = 735, TO = 1080 // 12:15–18:00
const top = (minute: number) => (minute - FROM) / (TO - FROM) * 100 + '%'
const span = (start: number, end: number) => ({ top: top(start), height: (end - start) / (TO - FROM) * 100 + '%' })
const DAYS: Array<{ name: string; dismissal: string; gaps: Array<[number, number]>; label: string }> = [
  { name: '월', dismissal: '12:50', gaps: [[52, 64]], label: '빈 30분' },
  { name: '화', dismissal: '13:40', gaps: [], label: '채움 ✓' },
  { name: '수', dismissal: '13:40', gaps: [[0, 30]], label: '빈 1시간' },
  { name: '목', dismissal: '13:40', gaps: [], label: '채움 ✓' },
  { name: '금', dismissal: '12:50', gaps: [[20, 40], [70, 100]], label: '빈 2시간' },
]
const BLOCKS = [
  { kind: 'care', name: '학교 돌봄', start: 770, end: 840, tag: '돌봄' },
  { kind: 'afterschool', name: '건축교실', start: 840, end: 900, tag: '방과후' },
  { kind: 'academy', name: '수영', start: 930, end: 980, tag: '학원' },
  { kind: 'personal', name: '도서관 읽기', start: 980, end: 1020, tag: '개인' },
] as const
const fmt = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export default function GapMapExample() {
  return <figure className="gap-example" data-testid="gap-start-preview" aria-label="예시 시간표: 월요일 하교 12:50 뒤 돌봄, 건축교실, 30분 빈 시간, 수영, 도서관 읽기, 보호자 귀가 17:00">
    <div className="gap-example__head" aria-hidden="true"><span className="gap-example__tag">예시</span><b>윤중초 · 월요일</b></div>
    <div className="gap-example__strip" aria-hidden="true">{DAYS.map((day, index) => <span key={day.name} data-active={index === 0 || undefined}>
      <b>{day.name}</b><small>{day.dismissal}</small>
      <i>{day.gaps.map(([from, to]) => <em key={from} style={{ left: from + '%', width: to - from + '%' }} />)}</i>
      <strong data-filled={!day.gaps.length || undefined}>{day.label}</strong>
    </span>)}</div>
    <div className="gap-example__board" aria-hidden="true">
      <div className="gap-example__axis">{[780, 840, 900, 960, 1020].map((minute) => <span key={minute} style={{ top: top(minute) }}>{minute / 60}:00</span>)}</div>
      <div className="gap-example__day">
        <div className="gap-example__school" style={{ height: top(770) }}>수업</div>
        <div className="gap-example__line gap-example__line--school" style={{ top: top(770) }}><span>하교 12:50 · 예상</span></div>
        {BLOCKS.map((block) => <div key={block.name} className="gap-example__block" data-kind={block.kind} data-candidate={block.kind === 'care' || undefined} style={span(block.start, block.end)}>
          <b>{block.name}</b><small>{fmt(block.start)}–{fmt(block.end)} <em>{block.tag}</em></small>
        </div>)}
        <div className="gap-example__gap" style={span(900, 930)}><span><Plus size={13} strokeWidth={3} /></span>빈 시간 30분</div>
        <div className="gap-example__home" style={{ top: top(1020) }} />
        <div className="gap-example__line gap-example__line--home" style={{ top: top(1020) }}><span>보호자 귀가 17:00</span></div>
      </div>
    </div>
  </figure>
}
