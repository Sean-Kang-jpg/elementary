import { CalendarDays, CalendarPlus, HandHeart, Megaphone } from 'lucide-react'
import type { SlotIntent } from '../../utils/schedule/types'
import { INTENT_LABELS } from '../../utils/schedule/intent'
import { planPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'

/** 예시 하루. 실제 학교 자료가 아니라 화면 모양을 보여 주는 고정값이다. */
const SAMPLE_DAY: Array<{ time: string; label: string; intent: SlotIntent | null }> = [
  { time: '13:40', label: '정규수업 끝', intent: null },
  { time: '14:00~15:00', label: '방과후 창의미술', intent: 'interest' },
  { time: '15:00~17:00', label: '학교 오후돌봄', intent: 'safety' },
  { time: '17:00~17:50', label: '수학 학원', intent: 'basics' },
  { time: '18:00', label: '보호자 귀가', intent: null },
]

/**
 * 학교를 고르기 전 배움·돌봄(2026-11-03 사용자 요청). 학교 선택만 덩그러니 있으면 고른 뒤 무엇을 할 수 있는지
 * 알 수 없어서, 예시 시간표와 예시 글로 쓰임새를 먼저 보여 준다. 모두 '예시' 표시를 달고, 누르는 동작은 없다.
 */
export default function FrontyardPreview({ onNavigate }: { onNavigate: (path: string) => void }) {
  const weekPath = planPath('week')
  return (
    <section className="frontyard-preview" aria-labelledby="frontyard-preview-title">
      <h2 id="frontyard-preview-title">학교를 고르면 이렇게 쓸 수 있어요</h2>

      <article className="frontyard-preview__card">
        <p className="frontyard-preview__step"><CalendarDays size={16} aria-hidden="true" /> 우리 아이 한 주 시간표 <span className="frontyard-tag frontyard-tag--sample">예시</span></p>
        <p className="my-help">학교 하교 시각에 방과후·돌봄·학원을 이어 붙여 빈 시간을 찾아요.</p>
        <ol className="frontyard-preview__day" aria-label="예시 화요일 오후">
          <li className="frontyard-preview__weekday">화요일</li>
          {SAMPLE_DAY.map((row) => (
            <li key={row.time}>
              <span className="frontyard-preview__time">{row.time}</span>
              <span>{row.label}{row.intent && <em className={`intent-chip intent-chip--${row.intent}`}>{INTENT_LABELS[row.intent]}</em>}</span>
            </li>
          ))}
        </ol>
        <a className="my-button" href={weekPath} onClick={(event) => followLink(event, weekPath, onNavigate)}>
          <CalendarPlus size={15} aria-hidden="true" /> 우리집 일정에서 시간표 짜 보기
        </a>
      </article>

      <article className="frontyard-preview__card">
        <p className="frontyard-preview__step"><Megaphone size={16} aria-hidden="true" /> 학교 주변 수업·모집 소식 보기</p>
        <div className="frontyard-card frontyard-card--offer">
          <span className="frontyard-tag frontyard-tag--offer">모집해요</span>
          <span className="frontyard-tag frontyard-tag--sample">예시</span>
          <h3>초등 저학년 창의미술반 모집</h3>
          <p className="frontyard-card__meta">초1~2 · 월·수 14:00~15:00 · 셔틀 있음</p>
          <p className="frontyard-preview__hint"><CalendarPlus size={14} aria-hidden="true" /> 마음에 들면 ‘내 시간표에 담기’로 바로 넣어 볼 수 있어요</p>
        </div>
      </article>

      <article className="frontyard-preview__card">
        <p className="frontyard-preview__step"><HandHeart size={16} aria-hidden="true" /> 필요한 활동을 남기고 함께 모으기</p>
        <div className="frontyard-card frontyard-card--seek">
          <span className="frontyard-tag frontyard-tag--seek">찾아요</span>
          <span className="frontyard-tag frontyard-tag--sample">예시</span>
          <h3>화·목 하교 후 4시까지 돌봄을 찾고 있어요</h3>
          <p className="frontyard-card__meta">초1 · 화·목 14:00~16:00</p>
          <p className="frontyard-preview__hint"><HandHeart size={14} aria-hidden="true" /> 같은 걸 찾는 부모가 ‘저도 필요해요’를 누르면 학원·기관에 전해요</p>
        </div>
      </article>
    </section>
  )
}
