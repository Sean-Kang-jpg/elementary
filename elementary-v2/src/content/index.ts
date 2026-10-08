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
  /** 정부·지자체·교육청·법령 사이트(.go.kr, gov.kr). 빌드가 주소로 정한다. */
  official: boolean
}

/** 법령상 전국이 같은가, 교육감·학교가 정해 지역마다 다른가, 둘이 섞였나. */
export type ContentRule = 'national' | 'regional' | 'mixed'

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
  rule: ContentRule
  /** 날짜와 예시가 기준으로 삼은 학년도. */
  basisYear: number
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
  rule: ContentRule
  basisYear: number
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
export const RULE_LABELS = structure.rules as Record<ContentRule, string>

export const findGuide = (slug: string | null): Guide | null =>
  (slug ? GUIDES.find((guide) => guide.slug === slug) : null) ?? null

export const guidesOf = (stage: Stage): Guide[] => GUIDES.filter((guide) => guide.stage === stage)
