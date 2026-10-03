/**
 * Typed access to the guide and FAQ content. The JSON is written by
 * scripts/build-content.mjs from the markdown in this folder; edit the markdown.
 */
import content from './generated/content.json'

export interface Source {
  label: string
  url: string
}

export interface Guide {
  slug: string
  title: string
  description: string
  order: number
  group: string
  verifiedAt: string
  scope: string | null
  sources: Source[]
  html: string
}

export interface FaqItem {
  question: string
  html: string
}

export interface Faq {
  title: string
  description: string
  verifiedAt: string
  sources: Source[]
  note: string | null
  sections: Array<{ heading: string; items: FaqItem[] }>
}

export const GUIDES = content.guides as Guide[]
export const FAQ = content.faq as Faq

export const GUIDE_GROUPS: Array<{ id: string; label: string }> = [
  { id: 'admission', label: '입학 절차' },
  { id: 'move', label: '이사 시점별 안내' },
]

export const findGuide = (slug: string | null): Guide | null =>
  (slug ? GUIDES.find((guide) => guide.slug === slug) : null) ?? null
