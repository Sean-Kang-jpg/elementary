/**
 * 1학년 미리보기 (docs/product/LEARNING_CONTENT_PRINCIPLES.md): subjects and
 * stages anchored to the grade-1 textbook, and the content recommended for
 * each stage. scripts/build-content.mjs validates both files.
 */
import stagesFile from './learning/stages.json'
import itemsFile from './learning/items.json'

export interface Standard { code: string; text: string }
export interface Unit { term: string; name: string; note?: string }

export interface Stage {
  id: string
  label: string
  summary: string
  units: Unit[]
  standards: Standard[]
  beyondGrade1?: string
}

export interface Level { label: string; startStage: string }

export interface Subject {
  id: string
  label: string
  schoolNote: string
  sourceIds: string[]
  outsideSchool?: boolean
  levels: Level[]
  stages: Stage[]
}

export interface LearningSource { id: string; label: string; url: string }

export type SchoolLink = 'direct' | 'foundation' | 'extension' | 'outside'

export interface Review {
  grade: 'A' | 'B' | 'C'
  url: string
  usedAtSeven?: boolean
  period?: string
  finished?: '완북' | '중단' | '진행 중'
  parentInvolvement?: string
  good?: string
  bad?: string
  disclosure: '확인되지 않음'
  checkedAt: string
}

export interface LearningItem {
  key: string
  name: string
  type: 'video' | 'workbook' | 'book' | 'toy' | 'activity'
  subject: string
  stages: string[]
  schoolLink: SchoolLink
  schoolLinkBasis: string
  forWhom: string
  role: string
  parentInvolvement: string
  cost?: string
  url: string
  urlLabel?: string
  extraLinks?: Array<{ label: string; url: string }>
  evidence: { public: Array<{ label: string; url: string; page?: string }>; reviews: Review[] }
  verifiedAt: string
}

const stages = stagesFile as { verifiedAt: string; audience: string; sources: LearningSource[]; subjects: Subject[] }
export const LEARNING_VERIFIED_AT = stages.verifiedAt
export const LEARNING_AUDIENCE = stages.audience
export const LEARNING_SOURCES = stages.sources
export const SUBJECTS = stages.subjects
export const LEARNING_ITEMS = (itemsFile as { items: LearningItem[] }).items

export const LEARNING_PATH = '/grade1'

export const SCHOOL_LINK_LABELS: Record<SchoolLink, { label: string; tone: string }> = {
  direct: { label: '초1 직접 연계', tone: 'bg-emerald-50 text-emerald-800' },
  foundation: { label: '기초 준비', tone: 'bg-sky-50 text-sky-800' },
  extension: { label: '확장 활동', tone: 'bg-amber-50 text-amber-800' },
  outside: { label: '학교과정 외', tone: 'bg-gray-100 text-gray-700' },
}

export const ITEM_TYPE_LABELS: Record<LearningItem['type'], string> = {
  video: '영상',
  workbook: '문제집·워크북',
  book: '책·리더스',
  toy: '교구·놀잇감',
  activity: '활동·프린트',
}

export const itemsForStage = (stageId: string): LearningItem[] =>
  LEARNING_ITEMS.filter((item) => item.stages.includes(stageId))

export const sourcesOf = (subject: Subject): LearningSource[] =>
  LEARNING_SOURCES.filter((source) => subject.sourceIds.includes(source.id))
