import { useState } from 'react'
import { CalendarPlus, ExternalLink, Flag, HandHeart, Phone } from 'lucide-react'
import {
  POST_TYPE_LABELS,
  REPORT_REASONS,
  reportPost,
  toggleInterest,
  WEEKDAY_LABELS,
  type FrontyardPost,
  type ReportReason,
} from '../../services/frontyardService'
import { readPlans, writePlans } from '../../utils/schedule/plans'
import { addPostToPlan } from '../../utils/schedule/frontyard'
import { timetablePath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'
import { track } from '../../utils/analytics'

interface PostCardProps {
  post: FrontyardPost
  schoolId: string | null
  onNavigate: (path: string) => void
  interested?: boolean
  onInterestChange?: (on: boolean) => void
}

/** 같은 시간인 요일을 묶는다: 월 14:00~15:00, 수 14:00~15:00 → '월·수 14:00~15:00'. */
export const slotSummary = (slots: FrontyardPost['time_slots']): string[] => {
  const groups = new Map<string, number[]>()
  for (const slot of slots) {
    const key = `${slot.start}~${slot.end}`
    groups.set(key, [...(groups.get(key) ?? []), slot.weekday])
  }
  return [...groups].map(([time, days]) => `${[...new Set(days)].sort().map((day) => WEEKDAY_LABELS[day]).join('·')} ${time}`)
}

const gradeLabel = (min: number | null, max: number | null) =>
  min && max ? (min === max ? `초${min}` : `초${min}~${max}`) : null

const shortDate = (value: string) => {
  const [, month, day] = value.slice(0, 10).split('-')
  return `${Number(month)}/${Number(day)}`
}

export default function PostCard({ post, schoolId, onNavigate, interested = false, onInterestChange }: PostCardProps) {
  const [count, setCount] = useState(post.interest_count)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)

  const meta = [
    ...slotSummary(post.time_slots),
    gradeLabel(post.grade_min, post.grade_max),
    post.post_type === 'offer' && post.shuttle ? '차량 운행' : null,
    post.post_type === 'offer' ? post.fee_text : null,
    post.wants_vehicle ? '차량 희망' : null,
    post.wants_home_visit ? '방문 희망' : null,
    post.budget_text,
  ].filter(Boolean)

  const interest = async () => {
    if (post.sample) { setCount((n) => n + (interested ? -1 : 1)); onInterestChange?.(!interested); return }
    setBusy(true)
    const result = await toggleInterest(post.post_id)
    setBusy(false)
    if (!result.ok) { setMessage(result.message); return }
    setCount(result.value)
    onInterestChange?.(!interested)
    track('frontyard_interest', { state: interested ? 'off' : 'on' })
  }

  const addToTimetable = () => {
    const store = readPlans()
    const plan = store.plans.find((item) => item.schoolId === schoolId)
    if (!plan || !schoolId) {
      setMessage('이 학교 시간표 초안이 아직 없어요. 시간표에서 초안을 먼저 만들어 주세요.')
      return
    }
    const result = addPostToPlan(plan, post, () => crypto.randomUUID())
    if (!result.ok) {
      setMessage(result.reason === 'exists' ? '이미 내 시간표에 담았어요.' : '평일 수업 시간이 없어 담을 수 없어요.')
      return
    }
    try {
      writePlans({ ...store, plans: store.plans.map((item) => item.schoolId === schoolId ? result.plan : item) })
    } catch {
      // 기기 저장이 막히면(사생활 보호 모드·용량) 담았다고 말하지 않는다.
      setMessage('이 브라우저에 저장하지 못했어요.')
      return
    }
    setMessage('내 시간표에 ‘검토 중’으로 담았어요. 학원 신청은 따로 해야 해요.')
    track('frontyard_add_timetable', {})
  }

  const report = async (reason: ReportReason) => {
    setReporting(false)
    if (post.sample) { setMessage('신고를 받았어요.'); return }
    const result = await reportPost(post.post_id, reason)
    setMessage(result.ok ? '신고를 받았어요. 확인 후 처리할게요.' : result.message)
  }

  const link = post.external_url
  const internal = link?.startsWith('/')

  return (
    <article className={`frontyard-card frontyard-card--${post.post_type}`}>
      <span className={`frontyard-tag frontyard-tag--${post.post_type}`}>{POST_TYPE_LABELS[post.post_type]}</span>
      {post.sample && <span className="frontyard-tag frontyard-tag--sample">예시</span>}
      <h3>
        {link ? (
          <a href={link} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noopener noreferrer'}
            onClick={internal ? (event) => followLink(event, link, onNavigate) : undefined}>
            {post.title}{!internal && <ExternalLink size={14} aria-label="새 창" />}
          </a>
        ) : post.title}
      </h3>
      {meta.length > 0 && <p className="frontyard-card__meta">{meta.join(' · ')}</p>}
      {post.body && <p className="frontyard-card__body">{post.body}</p>}
      {post.post_type === 'offer' && (
        <p className="frontyard-card__provider">
          {post.provider_name ?? '학원·기관'}
          {post.last_confirmed_at && ` · 운영자 확인 ${shortDate(post.last_confirmed_at)}`}
          {post.recruit_until && ` · 모집 중(~${shortDate(post.recruit_until)})`}
        </p>
      )}

      {post.post_type !== 'notice' && (
        <div className="frontyard-card__actions">
          {post.post_type === 'seek' && (
            <button type="button" className="frontyard-interest" aria-pressed={interested} disabled={busy} onClick={interest}>
              <HandHeart size={16} aria-hidden="true" /> 저도 필요해요 <b>{count}</b>
            </button>
          )}
          {post.post_type === 'offer' && (
            <>
              <button type="button" className="my-button" onClick={addToTimetable}>
                <CalendarPlus size={15} aria-hidden="true" /> 내 시간표에 담기
              </button>
              {post.contact_url && <a className="my-button" href={post.contact_url} target="_blank" rel="noopener noreferrer">상담 안내</a>}
              {post.contact_phone && <a className="my-button" href={`tel:${post.contact_phone}`}><Phone size={14} aria-hidden="true" /> 전화</a>}
            </>
          )}
          <button type="button" className="frontyard-report" aria-expanded={reporting} onClick={() => setReporting((open) => !open)}>
            <Flag size={13} aria-hidden="true" /> 신고
          </button>
        </div>
      )}
      {reporting && (
        <ul className="frontyard-report-reasons" aria-label="신고 사유">
          {(Object.keys(REPORT_REASONS) as ReportReason[]).filter((reason) => reason !== 'ad_disguised' || post.post_type === 'seek').map((reason) => (
            <li key={reason}><button type="button" onClick={() => report(reason)}>{REPORT_REASONS[reason]}</button></li>
          ))}
        </ul>
      )}
      {message && (
        <p className="my-help" role="status">
          {message}
          {message.includes('초안') && schoolId && (
            <> <a href={timetablePath(schoolId)} onClick={(event) => followLink(event, timetablePath(schoolId), onNavigate)}>시간표 만들기</a></>
          )}
        </p>
      )}
    </article>
  )
}
