import { supabase } from '../lib/supabase'
import { findGuide, findLearning } from '../content'
import { parseRoute } from '../utils/urlState'
import { normalizeInstagramUrl } from '../utils/instagram'

export { normalizeInstagramUrl }

/**
 * 우리 인스타그램 게시물과 어디초 페이지의 연결 (SQL 27, 인스타 연동 1단계).
 *
 * 페이지는 이름이 아니라 바뀌지 않는 키로 가리킨다 — 학습·가이드 slug, 지역 허브 경로, 교육부 school_id.
 * 같은 이름의 학교가 링크를 나눠 갖는 일이 없다. 테이블이 아직 없으면 화면은 카드를 안 보인다(fail-open).
 */

export type SocialTargetType = 'learn' | 'guide' | 'area' | 'school'
export type SocialPostType = 'carousel' | 'reel' | 'post'

export interface SocialLink {
  link_id: number
  platform: 'instagram'
  post_url: string
  post_type: SocialPostType
  target_type: SocialTargetType
  target_key: string
  title: string | null
  visible: boolean
  created_at: string
}

export const POST_TYPE_LABELS: Record<SocialPostType, string> = { carousel: '캐러셀', reel: '릴스', post: '게시물' }

const NOT_DEPLOYED = new Set(['PGRST205', '42P01'])
const isNotDeployed = (error: { code?: string } | null) => Boolean(error?.code && NOT_DEPLOYED.has(error.code))

/** 붙여 넣은 어디초 주소(또는 경로)를 연결 대상으로. 학습·가이드는 있는 글인지까지 본다. 지금은 학교·학습·가이드만. */
export const parseTarget = (input: string): { type: SocialTargetType; key: string; label: string } | null => {
  let path = input.trim()
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname
  } catch {
    return null
  }
  const route = parseRoute(path)
  if (route.kind === 'school') return { type: 'school', key: route.key, label: `학교 ${route.key}` }
  if (route.kind === 'learn' && route.slug) {
    const item = findLearning(route.slug)
    return item ? { type: 'learn', key: item.slug, label: item.title } : null
  }
  if (route.kind === 'guide' && route.slug) {
    const guide = findGuide(route.slug)
    return guide ? { type: 'guide', key: guide.slug, label: guide.title } : null
  }
  // 지역 허브(area)는 테이블이 받지만 아직 화면에 자리가 없다 — 허브는 서버 HTML을 통째로 보인다.
  // 보이지 않을 연결을 만들지 않도록 2단계 전까지 받지 않는다.
  return null
}

/** 한 페이지에 붙은, 보이기로 한 게시물. 실패하거나 테이블이 없으면 빈 목록이다. */
export const getSocialLinks = async (type: SocialTargetType, key: string): Promise<SocialLink[]> => {
  const { data, error } = await supabase
    .from('social_links')
    .select('link_id, platform, post_url, post_type, target_type, target_key, title, visible, created_at')
    .eq('target_type', type)
    .eq('target_key', key)
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(6)
  if (error) {
    if (!isNotDeployed(error)) console.error('인스타그램 연결 조회 실패:', error)
    return []
  }
  return (data ?? []) as SocialLink[]
}

// 관리자 -------------------------------------------------------------------

export const listAllSocialLinks = async (): Promise<{ links: SocialLink[]; notDeployed: boolean }> => {
  const { data, error } = await supabase
    .from('social_links')
    .select('link_id, platform, post_url, post_type, target_type, target_key, title, visible, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    if (isNotDeployed(error)) return { links: [], notDeployed: true }
    throw error
  }
  return { links: (data ?? []) as SocialLink[], notDeployed: false }
}

export const addSocialLink = async (link: {
  post_url: string
  post_type: SocialPostType
  target_type: SocialTargetType
  target_key: string
  title: string | null
}): Promise<void> => {
  const { error } = await supabase.from('social_links').insert({ platform: 'instagram', ...link })
  if (error) throw error
}

export const setSocialLinkVisible = async (linkId: number, visible: boolean): Promise<void> => {
  const { error } = await supabase.from('social_links').update({ visible, updated_at: new Date().toISOString() }).eq('link_id', linkId)
  if (error) throw error
}

export const deleteSocialLink = async (linkId: number): Promise<void> => {
  const { error } = await supabase.from('social_links').delete().eq('link_id', linkId)
  if (error) throw error
}
