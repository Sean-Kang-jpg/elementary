/**
 * Typed access to the guide and FAQ content. The JSON is written by
 * scripts/build-content.mjs from the markdown in this folder; edit the markdown.
 */
import content from './generated/content.json'
import structure from './structure.json'
import type { Stage } from '../utils/entryYear'

export interface Source {
  label: string
  url: string
}

export interface GuideSummary {
  kind: 'steps' | 'timeline' | 'checks'
  title: string
  items: Array<{ title: string; text?: string; when?: string }>
}

export interface Guide {
  slug: string
  title: string
  description: string
  order: number
  stage: Stage
  group: string
  verifiedAt: string
  scope: string | null
  summary: GuideSummary | null
  sources: Source[]
  html: string
}

export interface FaqItem {
  question: string
  html: string
}

export interface Faq {
  stage: Stage
  title: string
  description: string
  verifiedAt: string
  sources: Source[]
  note: string | null
  sections: Array<{ heading: string; items: FaqItem[] }>
}

export const GUIDES = content.guides as Guide[]
export const FAQS = content.faqs as Faq[]

export const FAQ_PAGE = structure.faqPage
export const GUIDE_LIST = structure.guideList

/** Groups within a stage, in reading order. */
export const GUIDE_GROUPS = structure.groups as Array<{ id: string; stage: Stage; label: string }>

export const findGuide = (slug: string | null): Guide | null =>
  (slug ? GUIDES.find((guide) => guide.slug === slug) : null) ?? null

export const guidesOf = (stage: Stage): Guide[] => GUIDES.filter((guide) => guide.stage === stage)
