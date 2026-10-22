import { supabase } from '../lib/supabase'
import { currentVoter, ensureVoter } from '../lib/voter'
import { LEARNING } from '../content'
import { learnPath, type FrontyardSlot } from '../utils/urlState'
import { listAllSocialLinks } from './socialService'

/**
 * 학교앞마당 (SQL 33, docs/product/FRONTYARD_PLAN.md).
 *
 * 글은 말머리로 나뉜다: offer [모집해요] 학원·기관 홍보(운영자 승인 뒤 공개), seek [찾아요] 부모가 찾는
 * 수업·돌봄·이동(바로 공개), notice [어디초 소식] 운영 글. 쓰기는 모두 SQL 33의 함수를 거치고, 브라우저는
 * 테이블에 직접 쓰지 않는다. 쓰기 전에 익명 세션을 만든다(lib/voter.ts) — 읽기만 하는 방문자에게는 만들지 않는다.
 *
 * SQL 33이 없으면(PGRST202/42883) 피드는 available = false로 돌아오고, 화면은 저장소의 학습 준비 글과
 * 인스타 연결(SQL 27)로 만든 '어디초 소식'만 보인다. 개발 서버에서는 예시 글을 섞어 화면을 확인한다.
 */

export type FrontyardPostType = 'offer' | 'seek' | 'notice'
export type FrontyardCategory = 'academy' | 'care' | 'mobility' | 'learning'

export const POST_TYPE_LABELS: Record<FrontyardPostType, string> = {
  offer: '모집해요',
  seek: '찾아요',
  notice: '어디초 소식',
}

/** 부모가 고르는 분야. 'learning'은 소식만 쓴다. 방학·특강은 2026-10-21 결정으로 뺐다. */
export const CATEGORY_LABELS: Record<Exclude<FrontyardCategory, 'learning'>, string> = {
  academy: '학원·과외',
  care: '돌봄',
  mobility: '등하원',
}

export const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일']

export interface FrontyardPost {
  post_id: string
  post_type: FrontyardPostType
  category: FrontyardCategory
  title: string
  body: string
  grade_min: number | null
  grade_max: number | null
  provider_name: string | null
  wants_vehicle: boolean | null
  wants_home_visit: boolean | null
  budget_text: string | null
  fee_text: string | null
  shuttle: boolean | null
  recruit_until: string | null
  contact_url: string | null
  contact_phone: string | null
  /** 소식의 원문. 어디초 안의 주소(/learn/…)이거나 인스타그램 주소다. */
  external_url: string | null
  pinned: boolean
  interest_count: number
  last_confirmed_at: string | null
  created_at: string
  time_slots: FrontyardSlot[]
  /** 개발 서버에서만 섞는 예시 글. */
  sample?: boolean
}

export interface FeedQuery {
  type?: FrontyardPostType | null
  category?: FrontyardCategory | null
  slot?: FrontyardSlot | null
}

const NOT_DEPLOYED = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])
const isNotDeployed = (error: { code?: string } | null) => Boolean(error?.code && NOT_DEPLOYED.has(error.code))
const isDev = Boolean((import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV)

const hhmm = (value: string) => value.slice(0, 5)
const toPost = (row: Omit<FrontyardPost, 'time_slots'> & { time_slots: Array<{ weekday: number; start: string; end: string }> | null }): FrontyardPost => ({
  ...row,
  time_slots: (row.time_slots ?? []).map((slot) => ({ weekday: slot.weekday, start: hhmm(slot.start), end: hhmm(slot.end) })),
})

/** 그 학교 피드(SQL 33 frontyard_feed). 소식은 따로 모은다 — fetchNotices. */
export const fetchFrontyardFeed = async (schoolId: string, query: FeedQuery = {}): Promise<{ available: boolean; posts: FrontyardPost[] }> => {
  const { data, error } = await supabase.rpc('frontyard_feed', {
    p_school_id: schoolId,
    p_post_type: query.type ?? null,
    p_category: query.category ?? null,
    p_weekday: query.slot?.weekday ?? null,
    p_start: query.slot?.start ?? null,
    p_end: query.slot?.end ?? null,
    p_limit: 50,
  })
  if (error) {
    if (!isNotDeployed(error)) throw error
    return { available: false, posts: isDev ? filterSamples(query) : [] }
  }
  return { available: true, posts: (data ?? []).map(toPost).filter((post: FrontyardPost) => post.post_type !== 'notice') }
}

/**
 * 어디초 소식: SQL 33의 운영 글 + 인스타 연결(SQL 27) + 저장소의 학습 준비 글. 원본은 각자 한 곳이고
 * 학교마다 복사하지 않는다. 최신이 먼저다.
 */
export const fetchNotices = async (schoolId: string | null): Promise<FrontyardPost[]> => {
  const [db, social] = await Promise.all([
    schoolId
      ? supabase.rpc('frontyard_feed', { p_school_id: schoolId, p_post_type: 'notice', p_limit: 50 })
        .then(({ data, error }) => (error ? [] : (data ?? []).map(toPost) as FrontyardPost[]))
      : Promise.resolve([] as FrontyardPost[]),
    listAllSocialLinks().then(({ links }) => links).catch(() => []),
  ])
  const fromSocial = social.filter((link) => link.visible).map((link): FrontyardPost => notice({
    post_id: `social-${link.link_id}`,
    title: link.title ?? '어디초 인스타그램 새 글',
    body: '',
    external_url: link.post_url,
    created_at: link.created_at,
  }))
  const fromLearning = LEARNING.filter((item) => item.status === 'published' || (isDev && item.status === 'review'))
    .map((item): FrontyardPost => notice({
      post_id: `learn-${item.slug}`,
      title: item.title,
      body: item.description,
      external_url: learnPath(item.slug),
      created_at: item.verifiedAt,
    }))
  const all = [...db, ...fromSocial, ...fromLearning]
  // 같은 원문을 가리키는 소식은 하나만(운영 글이 인스타 링크를 다시 소개할 수 있다).
  const seen = new Set<string>()
  return all
    .filter((post) => {
      const key = post.external_url ?? post.post_id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
}

const notice = (fields: Pick<FrontyardPost, 'post_id' | 'title' | 'body' | 'external_url' | 'created_at'>): FrontyardPost => ({
  post_type: 'notice', category: 'learning', grade_min: null, grade_max: null, provider_name: null,
  wants_vehicle: null, wants_home_visit: null, budget_text: null, fee_text: null, shuttle: null,
  recruit_until: null, contact_url: null, contact_phone: null, pinned: false, interest_count: 0,
  last_confirmed_at: null, time_slots: [], ...fields,
})

// ---- 쓰기 ----------------------------------------------------------------------

export type WriteResult<T = void> = { ok: true; value: T } | { ok: false; message: string }

/** 화면이 먼저 막는 규칙. 서버(frontyard_has_contact)도 같은 것을 다시 본다. */
const CONTACT = /0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|open\.kakao\.com|카톡\s*아이디|카카오톡\s*id/i
export const hasContactDetails = (text: string) => CONTACT.test(text)

const writeError = (error: { code?: string; message?: string }): string => {
  if (isNotDeployed(error)) return '아직 글쓰기를 준비하고 있어요. 조금만 기다려 주세요.'
  if (error.code === '54000') return error.message?.includes('report') ? '오늘은 신고를 더 할 수 없어요.' : '오늘은 글을 더 올릴 수 없어요. 하루 3개까지예요.'
  if (error.code === '22023' && error.message?.includes('contact')) return '전화번호·이메일·메신저 아이디는 쓸 수 없어요.'
  if (error.code === '22023') return '입력한 내용을 다시 확인해 주세요.'
  return '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

const withSession = async <T>(run: () => Promise<WriteResult<T>>): Promise<WriteResult<T>> => {
  try {
    await ensureVoter()
  } catch {
    return { ok: false, message: '지금은 이 브라우저를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }
  }
  return run()
}

export interface SeekDraft {
  schoolId: string
  category: Exclude<FrontyardCategory, 'learning'>
  title: string
  body: string
  grade: number
  slots: FrontyardSlot[]
  wantsVehicle: boolean
  wantsHomeVisit: boolean
  budget: string
  days: number
}

/** [찾아요] 올리기. 성공하면 새 글 ID. */
export const createSeekPost = (draft: SeekDraft): Promise<WriteResult<string>> => withSession(async () => {
  const { data, error } = await supabase.rpc('create_frontyard_post', {
    p_post: {
      post_type: 'seek',
      category: draft.category,
      title: draft.title.trim(),
      body: draft.body.trim(),
      grade_min: draft.grade,
      grade_max: draft.grade,
      school_ids: [draft.schoolId],
      time_slots: draft.slots,
      wants_vehicle: draft.wantsVehicle,
      wants_home_visit: draft.wantsHomeVisit,
      budget_text: draft.budget.trim() || null,
      expires_in_days: draft.days,
    },
  })
  if (error) return { ok: false, message: writeError(error) }
  return { ok: true, value: data as string }
})

/** "저도 필요해요" 누르기·취소. 바뀐 뒤의 개수. */
export const toggleInterest = (postId: string): Promise<WriteResult<number>> => withSession(async () => {
  const { data, error } = await supabase.rpc('toggle_frontyard_interest', { p_post_id: postId })
  if (error) return { ok: false, message: writeError(error) }
  return { ok: true, value: data as number }
})

/** 이 브라우저가 누른 글. 세션이 없으면 만들지 않고 빈 집합이다. */
export const fetchMyInterests = async (postIds: string[]): Promise<Set<string>> => {
  if (!postIds.length || !(await currentVoter())) return new Set()
  const { data, error } = await supabase.rpc('my_frontyard_interests', { p_post_ids: postIds })
  if (error) return new Set()
  return new Set((data ?? []) as string[])
}

export type ReportReason = 'personal_info' | 'ad_disguised' | 'inappropriate' | 'spam' | 'other'
export const REPORT_REASONS: Record<ReportReason, string> = {
  personal_info: '아이·가족 정보나 연락처가 있어요',
  ad_disguised: '찾아요로 올린 학원 홍보예요',
  inappropriate: '부적절한 내용이에요',
  spam: '같은 글이 반복돼요',
  other: '기타',
}

export const reportPost = (postId: string, reason: ReportReason): Promise<WriteResult> => withSession(async () => {
  const { error } = await supabase.rpc('report_frontyard_post', { p_post_id: postId, p_reason: reason })
  if (error) return { ok: false, message: writeError(error) }
  return { ok: true, value: undefined }
})

// ---- 개발 서버 예시 ----------------------------------------------------------------

const SAMPLES: FrontyardPost[] = [
  {
    ...notice({ post_id: 'sample-offer-1', title: '초등 저학년 창의미술반 모집', body: '초1~2 소규모(6명) 창의미술반이에요. 재료비 포함.', external_url: null, created_at: '2026-10-20T09:00:00Z' }),
    post_type: 'offer', category: 'academy', grade_min: 1, grade_max: 2, provider_name: '예시미술학원',
    fee_text: '월 16만 원', shuttle: true, recruit_until: '2026-11-30', last_confirmed_at: '2026-10-20',
    time_slots: [{ weekday: 1, start: '14:00', end: '15:00' }, { weekday: 3, start: '14:00', end: '15:00' }],
    sample: true,
  },
  {
    ...notice({ post_id: 'sample-seek-1', title: '화·목 하교 후 돌봄 프로그램을 찾고 있어요', body: '돌봄교실이 끝나는 4시까지 다닐 곳이 있을까요?', external_url: null, created_at: '2026-10-19T12:00:00Z' }),
    post_type: 'seek', category: 'care', grade_min: 1, grade_max: 1, interest_count: 4,
    time_slots: [{ weekday: 2, start: '14:00', end: '16:00' }, { weekday: 4, start: '14:00', end: '16:00' }],
    sample: true,
  },
  {
    ...notice({ post_id: 'sample-seek-2', title: '학원 사이 이동을 도와줄 등하원 도우미', body: '', external_url: null, created_at: '2026-10-18T08:00:00Z' }),
    post_type: 'seek', category: 'mobility', grade_min: 1, grade_max: 1, wants_vehicle: true, interest_count: 2,
    time_slots: [{ weekday: 5, start: '13:00', end: '14:00' }],
    sample: true,
  },
]

const filterSamples = (query: FeedQuery): FrontyardPost[] => SAMPLES.filter((post) =>
  (!query.type || post.post_type === query.type)
  && (!query.category || post.category === query.category)
  && (!query.slot || post.time_slots.some((slot) => slot.weekday === query.slot!.weekday
    && slot.end > query.slot!.start && slot.start < query.slot!.end)))
