/**
 * Curriculum cards and the item dictionary (PRD_CURRICULUM_SHARING). Editor
 * content kept in src/content/curriculum/*.json; scripts/build-content.mjs
 * validates it, and etl/upload_curriculum_refs.py loads the like keys (SQL 24).
 */
import taxonomy from './curriculum/taxonomy.json'
import itemsFile from './curriculum/items.json'
import plansFile from './curriculum/plans.json'
import { findRegion } from '../constants/regionRegistry'

export interface CurriculumItem {
  key: string
  name: string
  aliases?: string[]
  type: string
  domains: string[]
  ageMin?: number
  ageMax?: number
  description?: string
  url: string
  verifiedAt: string
}

export interface PlanEntry {
  item: string
  monthsUsed?: number
  note?: string
}

export interface PlanModule {
  domain: string
  note?: string
  items: PlanEntry[]
}

export interface CurriculumPlan {
  key: string
  title: string
  summary: string
  author: 'editor'
  ageBand: string
  region: string | null
  weeklyHours?: number
  monthlyCost?: string
  publishedAt: string
  modules: PlanModule[]
}

type Labeled = { id: string; label: string }

/**
 * Off unless VITE_CURRICULUM_ENABLED=1 at build time. The feature is on master
 * but held from production (2026-10-05) while its placement is reconsidered;
 * with the flag off its addresses open the home and the privacy policy does
 * not describe likes, so a release of master ships none of it.
 */
const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
export const CURRICULUM_ENABLED = env.VITE_CURRICULUM_ENABLED === '1'

export const ITEMS = (itemsFile as { items: CurriculumItem[] }).items
export const PLANS = (plansFile as { plans: CurriculumPlan[] }).plans
export const TYPES = taxonomy.types as Labeled[]
export const DOMAINS = taxonomy.domains as Labeled[]
export const AGE_BANDS = taxonomy.ageBands as Labeled[]
export const COST_BANDS = taxonomy.costBands as Labeled[]
/** Distinct voters a ranking cell needs before its order is shown (PRD 3절). */
export const SAMPLE_THRESHOLD = taxonomy.sampleThreshold

const label = (list: Labeled[], id: string | null | undefined) => list.find((entry) => entry.id === id)?.label ?? id ?? ''
export const typeLabel = (id: string) => label(TYPES, id)
export const domainLabel = (id: string) => label(DOMAINS, id)
export const ageBandLabel = (id: string) => label(AGE_BANDS, id)
export const costLabel = (id: string | undefined) => label(COST_BANDS, id)
export const regionLabel = (region: string | null) => region ? findRegion(region)?.shortName ?? region : '전국'

export const findItem = (key: string | null): CurriculumItem | null => ITEMS.find((item) => item.key === key) ?? null
export const findPlan = (key: string | null): CurriculumPlan | null => PLANS.find((plan) => plan.key === key) ?? null
export const plansWithItem = (key: string): CurriculumPlan[] =>
  PLANS.filter((plan) => plan.modules.some((module) => module.items.some((entry) => entry.item === key)))

// Like targets (SQL 24). The plan-item key is derived, so reordering a card
// never moves a like; a card lists an item once, which build-content enforces.
export const planTarget = (plan: string) => `P:${plan}`
export const planItemTarget = (plan: string, item: string) => `PI:${plan}:${item}`
export const itemTarget = (item: string) => `I:${item}`

// Addresses follow ADR-007: only the part after the last `--` is read.
const readable = (text: string) => text.replace(/[\\/?#%&+\s]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
export const planPath = (plan: CurriculumPlan) => `/plans/${readable(plan.title)}--${plan.key}`
export const itemPath = (item: CurriculumItem) => `/items/${readable(item.name)}--${item.key}`
export const CURRICULUM_PATHS = { plans: '/plans', ranking: '/ranking' } as const
