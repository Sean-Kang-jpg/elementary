import { useEffect, useMemo, useState } from 'react'
import { MapPin, Megaphone, PencilLine, X } from 'lucide-react'
import type { School } from '../../types'
import { getSchoolDetail } from '../../services/dataService'
import {
  CATEGORY_LABELS,
  fetchFrontyardFeed,
  fetchMyInterests,
  fetchNotices,
  POST_TYPE_LABELS,
  WEEKDAY_LABELS,
  type FrontyardCategory,
  type FrontyardPost,
} from '../../services/frontyardService'
import { readFavorites, subscribeFavorites } from '../../utils/favorites'
import { displaySchoolName } from '../../utils/schoolName'
import { frontyardPath, parseFrontyardSlot, type FrontyardSlot } from '../../utils/urlState'
import SchoolSelection from '../search/SchoolSelection'
import PostCard from './PostCard'
import SeekComposer from './SeekComposer'
import OfferRequest from './OfferRequest'

interface FrontyardPageProps {
  schoolId: string | null
  onSchoolChange: (schoolId: string | null) => void
  onNavigate: (path: string) => void
}

type TypeFilter = 'all' | 'offer' | 'seek'

/** 우리 학교 글이 이보다 적으면 빈 자리를 '어디초 소식'으로 채운다(FRONTYARD_PLAN 2절). */
const FILL_UNTIL = 3

/**
 * 학교앞마당 (`/frontyard?school=B…`, 2026-10-21).
 *
 * 학교를 고르면 그 학교를 대상으로 한 [모집해요]·[찾아요] 글과, 모든 학교에 보이는 [어디초 소식]이 나온다.
 * 학교는 검색·노출 기준일 뿐 그 학교의 공식 프로그램이라는 뜻이 아니다. 시간표 빈칸에서 들어오면
 * `?day=&from=&to=`가 시간 조건 칩이 된다.
 */
export default function FrontyardPage({ schoolId, onSchoolChange, onNavigate }: FrontyardPageProps) {
  const [favorites, setFavorites] = useState(readFavorites)
  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])

  // 대상 학교는 시간표를 짠 학교들에서 고른다(2026-10-22 사용자 결정). 주소에 학교가 없으면
  // 내 시간표 → 가장 최근 초안 → 첫 관심 학교 순으로 연다(시간표 화면과 같다). 다른 학교는 검색으로.
  const fallbackId = favorites.find((item) => item.kind === 'school')?.id ?? null
  useEffect(() => {
    if (!schoolId && fallbackId) onSchoolChange(fallbackId)
  }, [schoolId, fallbackId, onSchoolChange])

  const [school, setSchool] = useState<{ id: string; school: School | null } | null>(null)
  useEffect(() => {
    if (!schoolId) return
    let active = true
    getSchoolDetail(schoolId)
      .then((row) => { if (active) setSchool({ id: schoolId, school: row }) })
      .catch(() => { if (active) setSchool({ id: schoolId, school: null }) })
    return () => { active = false }
  }, [schoolId])
  const current = school?.id === schoolId ? school.school : null
  const schoolName = current ? displaySchoolName(current.school_name, current.address, current.establishment_type) : null

  const [slot, setSlot] = useState<FrontyardSlot | null>(() => parseFrontyardSlot(window.location.search))
  const [type, setType] = useState<TypeFilter>('all')
  const [category, setCategory] = useState<Exclude<FrontyardCategory, 'learning'> | null>(null)
  const [allNotices, setAllNotices] = useState(false)
  const [composing, setComposing] = useState<'seek' | 'offer' | null>(() =>
    new URLSearchParams(window.location.search).get('write') === 'seek' ? 'seek' : null)

  const clearSlot = () => {
    setSlot(null)
    window.history.replaceState({}, '', frontyardPath(schoolId))
  }

  const [feed, setFeed] = useState<{ key: string; available: boolean; posts: FrontyardPost[]; error: boolean } | null>(null)
  const [reload, setReload] = useState(0)
  const feedKey = `${schoolId}|${type}|${category}|${slot?.weekday}-${slot?.start}-${slot?.end}|${reload}`
  useEffect(() => {
    if (!schoolId) return
    let active = true
    fetchFrontyardFeed(schoolId, { type: type === 'all' ? null : type, category, slot })
      .then((result) => { if (active) setFeed({ key: feedKey, ...result, error: false }) })
      .catch(() => { if (active) setFeed({ key: feedKey, available: true, posts: [], error: true }) })
    return () => { active = false }
  }, [schoolId, type, category, slot, feedKey])
  const loaded = feed?.key === feedKey ? feed : null

  const [notices, setNotices] = useState<FrontyardPost[]>([])
  useEffect(() => {
    let active = true
    fetchNotices(schoolId).then((rows) => { if (active) setNotices(rows) }).catch(() => { if (active) setNotices([]) })
    return () => { active = false }
  }, [schoolId])

  const [mine, setMine] = useState<Set<string>>(new Set())
  const postIds = useMemo(() => (loaded?.posts ?? []).filter((post) => !post.sample).map((post) => post.post_id), [loaded])
  useEffect(() => {
    let active = true
    fetchMyInterests(postIds).then((ids) => { if (active) setMine(ids) })
    return () => { active = false }
  }, [postIds])

  // 소식은 '전체'에서만: 맨 위 하나를 고정하고, 우리 학교 글이 적으면 빈 자리를 채운다.
  const posts = loaded?.posts ?? []
  const showNotices = type === 'all' && !category && !slot
  const pinned = showNotices ? notices[0] : undefined
  const fillers = showNotices ? notices.slice(1, 1 + Math.max(0, FILL_UNTIL - posts.length)) : []

  const pickSchool = (id: string | null) => {
    if (id !== schoolId && composing && !window.confirm('학교를 변경하면 작성 중인 내용이 닫힙니다. 변경할까요?')) return
    setComposing(null)
    setSlot(null)
    onSchoolChange(id)
  }

  if (allNotices) {
    return (
      <section className="app-destination app-page content-page frontyard-page" aria-labelledby="frontyard-title">
        <div className="content-page__inner">
          <button type="button" className="frontyard-back" onClick={() => setAllNotices(false)}>← 배움·돌봄으로</button>
          <h1 id="frontyard-title">어디초 소식</h1>
          <p className="content-page__lead">배움·돌봄에 함께 보이는 학습 준비 글과 어디초 인스타그램 글이에요.</p>
          <ul className="frontyard-list">
            {notices.map((post) => <li key={post.post_id}><PostCard post={post} schoolId={schoolId} onNavigate={onNavigate} /></li>)}
          </ul>
          {!notices.length && <p className="my-help">아직 소식이 없어요.</p>}
        </div>
      </section>
    )
  }

  return (
    <section className="app-destination app-page content-page frontyard-page" aria-labelledby="frontyard-title">
      <div className="content-page__inner">
        <p className="frontyard-page__eyebrow">우리 아이의 학교동네</p>
        <h1 id="frontyard-title">필요한 수업과 돌봄을 찾아보세요</h1>
        <p className="content-page__lead">우리 학교 주변 프로그램을 찾고, 원하는 활동이 없다면 직접 요청해 보세요.</p>

        <div className="frontyard-school">
          <MapPin size={18} aria-hidden="true" />
          <strong>{schoolId ? `${schoolName ?? '학교'} 주변` : '학교를 골라 주세요'}</strong>
        </div>
        <SchoolSelection schoolId={schoolId} onChange={pickSchool} />

        {schoolId && (
          <>
            <div className="frontyard-actions">
              <button type="button" className="frontyard-action" aria-pressed={composing === 'offer'}
                onClick={() => setComposing(composing === 'offer' ? null : 'offer')}>
                <Megaphone size={20} aria-hidden="true" />
                <strong>소식 올리기</strong>
                <small>학원·기관의 수업과 모집 안내</small>
              </button>
              <button type="button" className="frontyard-action" aria-pressed={composing === 'seek'}
                onClick={() => setComposing(composing === 'seek' ? null : 'seek')}>
                <PencilLine size={20} aria-hidden="true" />
                <strong>필요한 활동 남기기</strong>
                <small>부모가 찾는 수업·돌봄·이동</small>
              </button>
            </div>

            {composing === 'seek' && (
              <SeekComposer schoolId={schoolId} schoolName={schoolName} initialSlot={slot}
                onClose={() => setComposing(null)}
                onPosted={() => { setComposing(null); setType('all'); setCategory(null); setReload((n) => n + 1) }} />
            )}
            {composing === 'offer' && <OfferRequest schoolName={schoolName} onClose={() => setComposing(null)} />}

            <div className="frontyard-chips" role="group" aria-label="글 고르기">
              {(['all', 'offer', 'seek'] as const).map((value) => (
                <button key={value} type="button" className="pref-chip" aria-pressed={type === value} onClick={() => setType(value)}>
                  {value === 'all' ? '전체' : POST_TYPE_LABELS[value]}
                </button>
              ))}
              <span className="frontyard-chips__divider" aria-hidden="true" />
              {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((value) => (
                <button key={value} type="button" className="pref-chip" aria-pressed={category === value}
                  onClick={() => setCategory(category === value ? null : value)}>
                  {CATEGORY_LABELS[value]}
                </button>
              ))}
            </div>
            {slot && (
              <p className="frontyard-slot">
                <button type="button" onClick={clearSlot} aria-label="시간 조건 지우기">
                  {WEEKDAY_LABELS[slot.weekday]} {slot.start}~{slot.end} <X size={14} aria-hidden="true" />
                </button>
                <span>시간표에서 고른 시간과 겹치는 글만 보여요.</span>
              </p>
            )}

            {!loaded ? (
              <p className="my-help" role="status">글을 불러오는 중…</p>
            ) : (
              <ul className="frontyard-list">
                {pinned && <li><PostCard post={pinned} schoolId={schoolId} onNavigate={onNavigate} /></li>}
                {posts.map((post) => (
                  <li key={post.post_id}>
                    <PostCard post={post} schoolId={schoolId} onNavigate={onNavigate} interested={mine.has(post.post_id)}
                      onInterestChange={(on) => setMine((prev) => { const next = new Set(prev); if (on) next.add(post.post_id); else next.delete(post.post_id); return next })} />
                  </li>
                ))}
                {fillers.map((post) => <li key={post.post_id}><PostCard post={post} schoolId={schoolId} onNavigate={onNavigate} /></li>)}
              </ul>
            )}
            {loaded?.error && <p className="my-help" role="alert">글을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
            {loaded && !posts.length && (
              <div className="frontyard-empty">
                <p><strong>{slot || category || type !== 'all' ? '조건에 맞는 글이 아직 없어요.' : `${schoolName ?? '이 학교'} 주변 글이 아직 없어요.`}</strong></p>
                <p className="my-help">찾는 수업이나 돌봄이 있다면 첫 글을 남겨 보세요. 같은 걸 찾는 부모가 ‘저도 필요해요’로 모이면 학원·기관에 전해요.</p>
                <button type="button" className="my-button my-button--primary" onClick={() => setComposing('seek')}>필요한 활동 남기기</button>
              </div>
            )}
            {showNotices && notices.length > 1 && (
              <button type="button" className="frontyard-more" onClick={() => setAllNotices(true)}>어디초 소식 모두 보기 ({notices.length})</button>
            )}
            {loaded && !loaded.available && posts.some((post) => post.sample) && (
              <p className="my-help">개발 서버 예시 글이에요. 운영에는 나오지 않아요.</p>
            )}
            <p className="my-help frontyard-note">학교 이름은 찾기 기준이에요. 이 학교의 공식 프로그램이라는 뜻이 아니에요.</p>
          </>
        )}
      </div>
    </section>
  )
}
