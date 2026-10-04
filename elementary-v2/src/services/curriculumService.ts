import { supabase } from '../lib/supabase'
import { currentVoter, ensureVoter } from '../lib/voter'

/**
 * Likes and rankings (SQL 24). Counts and rankings are public functions; a
 * voter's own likes are readable only by that voter. A database without SQL 24
 * answers "no such function/table", and the screens then show no counts rather
 * than an error.
 */

const NOT_DEPLOYED = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])

export const getLikeCounts = async (keys: string[]): Promise<Record<string, number>> => {
  if (!keys.length) return {}
  const { data, error } = await supabase.rpc('curriculum_like_counts', { p_keys: keys })
  if (error) {
    if (NOT_DEPLOYED.has(error.code)) return {}
    throw error
  }
  return Object.fromEntries(((data ?? []) as Array<{ target_key: string; likes: number }>).map((row) => [row.target_key, Number(row.likes)]))
}

/** Which of these targets this browser has liked. No voter yet means none. */
export const getMyLikes = async (keys: string[]): Promise<Set<string>> => {
  if (!keys.length || !(await currentVoter())) return new Set()
  const { data, error } = await supabase.from('curriculum_likes').select('target_key').in('target_key', keys)
  if (error) {
    if (NOT_DEPLOYED.has(error.code)) return new Set()
    throw error
  }
  return new Set(((data ?? []) as Array<{ target_key: string }>).map((row) => row.target_key))
}

export const setLike = async (targetKey: string, liked: boolean): Promise<void> => {
  const voter = await ensureVoter()
  if (liked) {
    const { error } = await supabase.from('curriculum_likes').insert({ voter_id: voter, target_key: targetKey })
    // 23505: already liked in another tab. The intent holds; nothing to undo.
    if (error && error.code !== '23505') throw error
    return
  }
  const { error } = await supabase.from('curriculum_likes').delete().eq('voter_id', voter).eq('target_key', targetKey)
  if (error) throw error
}

export interface RankingRow {
  item_key: string
  voters: number
  cell_voters: number
}

export interface RankingFilter {
  ageBand: string | null
  region: string | null
  domain: string | null
  days: number | null
}

export const getItemRanking = async (filter: RankingFilter): Promise<RankingRow[] | null> => {
  const { data, error } = await supabase.rpc('curriculum_item_ranking', {
    p_age_band: filter.ageBand,
    p_region: filter.region,
    p_domain: filter.domain,
    p_days: filter.days,
  })
  if (error) {
    if (NOT_DEPLOYED.has(error.code)) return null
    throw error
  }
  return ((data ?? []) as RankingRow[]).map((row) => ({ ...row, voters: Number(row.voters), cell_voters: Number(row.cell_voters) }))
}
