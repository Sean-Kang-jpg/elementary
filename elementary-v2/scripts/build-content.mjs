/**
 * Turn the guide and FAQ markdown into one JSON file both renderers read.
 *
 *     src/content/guides/*.md   ─┐
 *     src/content/faq*.md       ─┴─>  src/content/generated/content.json
 *
 * The app imports the JSON; scripts/build-shell-pages.mjs writes the same HTML
 * into static pages for crawlers (ADR-008 section 4). One conversion, so the page
 * a crawler indexes and the page a visitor reads cannot drift.
 *
 * It fails rather than publishing something wrong. Every claim in these pages is
 * about an official procedure (PRD v2 principles 6 and 8), so a page without its
 * sources or its verification date does not build; neither does a link to a
 * guide that does not exist, a description longer than Naver shows, or a page
 * with no stage.
 *
 * Runs before dev, build and typecheck. The output is generated, not committed.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import YAML from 'yaml'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(projectRoot, 'src', 'content')
const outFile = path.join(contentDir, 'generated', 'content.json')
/** What Naver Search Advisor shows before truncating a description. */
const DESCRIPTION_LIMIT = 80
/**
 * Where a family is relative to entry. `planning`: one to two years out, the
 * moving decision. `admission`: the autumn before entry through March - private
 * school applications, the notice, the preliminary call.
 */
const STAGES = ['planning', 'admission']

/** A guide's summary diagram: ordered steps, a dated timeline, or a set of checks. */
const SUMMARY_KINDS = ['steps', 'timeline', 'checks']
const SUMMARY_MAX_ITEMS = 6

const problems = []
const problem = (file, message) => problems.push(`${path.relative(projectRoot, file)}: ${message}`)

const marked = new Marked({
  gfm: true,
  // GFM reads a pair of single tildes as strikethrough, and Korean writes ranges
  // with a tilde: "10~1월에 ... 12~2월" came out crossed through between the two.
  // Nothing here is ever struck through, so a tilde is always just a tilde.
  tokenizer: {
    del() {
      return undefined
    },
  },
  renderer: {
    // External sources open in a new tab; links inside the site stay in place so
    // the app can route them without a reload.
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const external = /^https?:\/\//.test(href)
      const attrs = [`href="${href}"`]
      if (title) attrs.push(`title="${title}"`)
      if (external) attrs.push('target="_blank"', 'rel="noopener noreferrer"')
      return `<a ${attrs.join(' ')}>${text}</a>`
    },
  },
})

const readMarkdown = async (file) => {
  const raw = (await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n')
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    problem(file, 'missing front matter')
    return { meta: {}, body: raw }
  }
  return { meta: YAML.parse(match[1]) || {}, body: match[2] }
}

const checkCommon = (file, meta) => {
  for (const field of ['title', 'description', 'verifiedAt']) {
    if (!meta[field]) problem(file, `front matter needs ${field}`)
  }
  if (meta.description && [...String(meta.description)].length > DESCRIPTION_LIMIT) {
    problem(file, `description is ${[...String(meta.description)].length} characters, over ${DESCRIPTION_LIMIT}`)
  }
  if (!Array.isArray(meta.sources) || meta.sources.length === 0 || meta.sources.some((s) => !s?.label || !s?.url)) {
    problem(file, 'front matter needs sources, each with a label and a url')
  }
  if (!STAGES.includes(meta.stage)) problem(file, `stage must be one of ${STAGES.join(', ')}`)
}

// Guides --------------------------------------------------------------------

const guideFiles = (await fs.readdir(path.join(contentDir, 'guides')))
  .filter((name) => name.endsWith('.md'))
  .map((name) => path.join(contentDir, 'guides', name))

const guides = []
for (const file of guideFiles) {
  const { meta, body } = await readMarkdown(file)
  checkCommon(file, meta)
  const slug = path.basename(file, '.md')
  if (meta.slug && meta.slug !== slug) problem(file, `slug "${meta.slug}" does not match the file name`)
  const summary = meta.summary ?? null
  if (summary) {
    if (!SUMMARY_KINDS.includes(summary.kind)) problem(file, `summary.kind must be one of ${SUMMARY_KINDS.join(', ')}`)
    if (!summary.title) problem(file, 'summary needs a title')
    const items = Array.isArray(summary.items) ? summary.items : []
    if (items.length < 2 || items.length > SUMMARY_MAX_ITEMS) problem(file, `summary needs 2 to ${SUMMARY_MAX_ITEMS} items`)
    items.forEach((item, index) => {
      if (!item?.title) problem(file, `summary item ${index + 1} needs a title`)
      if (summary.kind === 'timeline' && !item?.when) problem(file, `timeline item ${index + 1} needs a when`)
    })
  }
  guides.push({
    slug,
    title: meta.title,
    description: meta.description,
    order: meta.order ?? 99,
    stage: meta.stage,
    group: meta.group ?? 'admission',
    verifiedAt: String(meta.verifiedAt),
    scope: meta.scope ?? null,
    summary,
    sources: meta.sources ?? [],
    html: marked.parse(body),
    file,
  })
}
guides.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.order - b.order)

// FAQ -----------------------------------------------------------------------
// One file per stage (faq.md, faq-planning.md), each made of sections (##)
// holding questions (###). A blockquote after the last question is that file's
// closing note.

const parseFaq = async (file) => {
  const { meta, body } = await readMarkdown(file)
  checkCommon(file, meta)
  const sections = []
  let current = null
  for (const token of marked.lexer(body)) {
    if (token.type === 'heading' && token.depth === 2) {
      sections.push({ heading: token.text, items: [] })
      current = null
    } else if (token.type === 'heading' && token.depth === 3) {
      if (!sections.length) problem(file, `question "${token.text}" is outside any ## section`)
      current = { question: token.text, tokens: [] }
      sections.at(-1)?.items.push(current)
    } else if (current) {
      current.tokens.push(token)
    }
  }
  let note = null
  const lastItem = sections.at(-1)?.items.at(-1)
  if (lastItem && lastItem.tokens.at(-1)?.type === 'blockquote') note = marked.parser([lastItem.tokens.pop()])
  if (!sections.some((section) => section.items.length)) problem(file, 'no questions found')
  return {
    stage: meta.stage,
    title: meta.title,
    description: meta.description,
    verifiedAt: String(meta.verifiedAt),
    sources: meta.sources ?? [],
    note,
    sections: sections.map((section) => ({
      heading: section.heading,
      items: section.items.map((item) => ({
        question: item.question,
        html: marked.parser(Object.assign(item.tokens, { links: {} })),
      })),
    })),
    file,
  }
}

const faqFiles = (await fs.readdir(contentDir))
  .filter((name) => /^faq(-[a-z]+)?\.md$/.test(name))
  .map((name) => path.join(contentDir, name))
const faqs = []
for (const file of faqFiles) faqs.push(await parseFaq(file))
faqs.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage))
for (const stage of STAGES) {
  if (faqs.filter((faq) => faq.stage === stage).length > 1) problem(contentDir, `more than one FAQ file has stage ${stage}`)
}

// Links ---------------------------------------------------------------------
// Every internal guide link must name a guide that exists. A broken link in a
// procedure guide sends a parent to a page that is not there at the moment they
// are trying to act.

const slugs = new Set(guides.map((guide) => guide.slug))
const checkLinks = (file, html) => {
  for (const [, slug] of html.matchAll(/href="\/guide\/([^"#?]+)"/g)) {
    if (!slugs.has(slug)) problem(file, `links to /guide/${slug}, which does not exist`)
  }
}
guides.forEach((guide) => checkLinks(guide.file, guide.html))
faqs.forEach((faq) => faq.sections.forEach((section) => section.items.forEach((item) => checkLinks(faq.file, item.html))))

// Bold that did not render. CommonMark will not close ** when it follows
// punctuation and runs straight into a Korean particle - "**통학구역(학구도)**을",
// "**'돌봄·방과후'**에서" - and the reader sees the asterisks. End the bold on a
// letter instead: "**통학구역**(학구도)을".
const checkMarkup = (file, html) => {
  const text = html.replace(/<[^>]+>/g, '')
  for (const match of text.matchAll(/\*\*/g)) {
    problem(file, `unrendered ** near "${text.slice(Math.max(0, match.index - 20), match.index + 22).replace(/\s+/g, ' ')}"`)
  }
}
guides.forEach((guide) => checkMarkup(guide.file, guide.html))
faqs.forEach((faq) => {
  if (faq.note) checkMarkup(faq.file, faq.note)
  faq.sections.forEach((section) => section.items.forEach((item) => checkMarkup(faq.file, item.html)))
})

// The roadmap and checklist link to guides and screens too, from JSON.
const APP_PATHS = new Set(['/', '/map', '/guide', '/faq', '/checklist'])
const checkPath = (file, link) => {
  if (!link) return
  const guide = link.match(/^\/guide\/([^/?#]+)$/)
  if (guide ? !slugs.has(guide[1]) : !APP_PATHS.has(link)) problem(file, `links to ${link}, which does not exist`)
}
for (const name of ['roadmap.json', 'checklist.json']) {
  const file = path.join(contentDir, name)
  const json = JSON.parse(await fs.readFile(file, 'utf8'))
  const tasks = name === 'roadmap.json'
    ? [...json.planning, ...Object.values(json.admission).flat()]
    : json.groups.flatMap((group) => group.items)
  const ids = new Set()
  for (const task of tasks) {
    checkPath(file, task.link)
    if (ids.has(task.id)) problem(file, `id ${task.id} is used twice`)
    ids.add(task.id)
  }
}

// Curriculum ----------------------------------------------------------------
// Editor cards and the item dictionary (PRD_CURRICULUM_SHARING). Keys become
// public addresses and like targets (SQL 24), so a duplicate, a malformed key or
// a card naming an item that does not exist must not ship.

const curriculumDir = path.join(contentDir, 'curriculum')
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const taxonomy = await readJson(path.join(curriculumDir, 'taxonomy.json'))
const itemsFile = path.join(curriculumDir, 'items.json')
const plansFile = path.join(curriculumDir, 'plans.json')
const { items: curriculumItems } = await readJson(itemsFile)
const { plans: curriculumPlans } = await readJson(plansFile)
const registry = await readJson(path.join(projectRoot, 'etl', 'region_registry.json'))
const REGIONS = new Set(registry.regions.map((region) => region.canonical_name))
/** Crockford Base32, 8 characters: the apartment key's alphabet (ADR-007). */
const CURRICULUM_KEY = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/
const ids = (list) => new Set(list.map((entry) => entry.id))
const TYPES = ids(taxonomy.types)
const DOMAINS = ids(taxonomy.domains)
const AGE_BANDS = ids(taxonomy.ageBands)
const COST_BANDS = ids(taxonomy.costBands)

const curriculumKeys = new Set()
const claimKey = (file, key, what) => {
  if (!CURRICULUM_KEY.test(key ?? '')) problem(file, `${what} key "${key}" is not 8 Crockford Base32 characters`)
  else if (curriculumKeys.has(key)) problem(file, `${what} key ${key} is used twice (items and cards share one key space)`)
  curriculumKeys.add(key)
}
const itemKeys = new Set()
for (const item of curriculumItems) {
  claimKey(itemsFile, item.key, `item "${item.name}"`)
  itemKeys.add(item.key)
  if (!item.name) problem(itemsFile, `item ${item.key} needs a name`)
  if (!TYPES.has(item.type)) problem(itemsFile, `item ${item.key} has unknown type "${item.type}"`)
  if (!Array.isArray(item.domains) || !item.domains.length || item.domains.some((domain) => !DOMAINS.has(domain))) {
    problem(itemsFile, `item ${item.key} needs domains from the taxonomy`)
  }
  if (!/^https?:\/\//.test(item.url ?? '')) problem(itemsFile, `item ${item.key} needs an official url`)
  if (!item.verifiedAt) problem(itemsFile, `item ${item.key} needs verifiedAt`)
}
for (const plan of curriculumPlans) {
  claimKey(plansFile, plan.key, `card "${plan.title}"`)
  if (!plan.title || !plan.summary) problem(plansFile, `card ${plan.key} needs a title and a summary`)
  if (plan.author !== 'editor') problem(plansFile, `card ${plan.key}: only editor cards exist in phase 1`)
  if (!AGE_BANDS.has(plan.ageBand)) problem(plansFile, `card ${plan.key} has unknown ageBand "${plan.ageBand}"`)
  if (plan.region != null && !REGIONS.has(plan.region)) problem(plansFile, `card ${plan.key} region must be a full 시·도 name or null`)
  if (plan.monthlyCost != null && !COST_BANDS.has(plan.monthlyCost)) problem(plansFile, `card ${plan.key} has unknown monthlyCost "${plan.monthlyCost}"`)
  if (!plan.publishedAt) problem(plansFile, `card ${plan.key} needs publishedAt`)
  const seen = new Set()
  if (!Array.isArray(plan.modules) || !plan.modules.length) problem(plansFile, `card ${plan.key} needs modules`)
  for (const module of plan.modules ?? []) {
    if (!DOMAINS.has(module.domain)) problem(plansFile, `card ${plan.key} has a module with unknown domain "${module.domain}"`)
    for (const entry of module.items ?? []) {
      if (!itemKeys.has(entry.item)) problem(plansFile, `card ${plan.key} names item ${entry.item}, which is not in items.json`)
      if (seen.has(entry.item)) problem(plansFile, `card ${plan.key} lists item ${entry.item} twice; its like key would collide`)
      seen.add(entry.item)
    }
  }
}

// 1학년 미리보기 -------------------------------------------------------------
// docs/product/LEARNING_CONTENT_PRINCIPLES.md. Every stage rests on official
// sources; every item names its school link with a basis and carries evidence.
// A review that copies text or lacks its disclosure check does not ship.

const learningDir = path.join(contentDir, 'learning')
const stagesFile = path.join(learningDir, 'stages.json')
const learningItemsFile = path.join(learningDir, 'items.json')
const learningStages = await readJson(stagesFile)
const { items: learningItems } = await readJson(learningItemsFile)
const SCHOOL_LINKS = new Set(['direct', 'foundation', 'extension', 'outside'])
const ITEM_TYPES = new Set(['video', 'workbook', 'book', 'toy', 'activity'])
const REVIEW_GRADES = new Set(['A', 'B', 'C'])
const sourceIds = new Set((learningStages.sources ?? []).map((source) => source.id))
for (const source of learningStages.sources ?? []) {
  if (!/^https?:\/\//.test(source.url ?? '')) problem(stagesFile, `source ${source.id} needs a url`)
}
if (!learningStages.verifiedAt) problem(stagesFile, 'needs verifiedAt')
const stageSubject = new Map()
for (const subject of learningStages.subjects ?? []) {
  if (!subject.sourceIds?.length || subject.sourceIds.some((id) => !sourceIds.has(id))) problem(stagesFile, `subject ${subject.id} needs known sourceIds`)
  const ids = new Set(subject.stages.map((stage) => stage.id))
  for (const stage of subject.stages) {
    if (stageSubject.has(stage.id)) problem(stagesFile, `stage ${stage.id} is used twice`)
    stageSubject.set(stage.id, subject.id)
    if (!subject.outsideSchool && !stage.units?.length) problem(stagesFile, `stage ${stage.id} needs grade-1 units`)
    if (!subject.outsideSchool && !stage.standards?.length) problem(stagesFile, `stage ${stage.id} needs standards`)
  }
  for (const level of subject.levels ?? []) {
    if (!ids.has(level.startStage)) problem(stagesFile, `level "${level.label}" starts at unknown stage ${level.startStage}`)
  }
}
const learningKeys = new Set()
for (const item of learningItems) {
  const at = `item ${item.key}`
  if (learningKeys.has(item.key)) problem(learningItemsFile, `${at} is used twice`)
  learningKeys.add(item.key)
  if (!ITEM_TYPES.has(item.type)) problem(learningItemsFile, `${at} has unknown type "${item.type}"`)
  if (!SCHOOL_LINKS.has(item.schoolLink)) problem(learningItemsFile, `${at} has unknown schoolLink "${item.schoolLink}"`)
  if (!item.schoolLinkBasis) problem(learningItemsFile, `${at} needs schoolLinkBasis (principles 4절)`)
  for (const field of ['name', 'forWhom', 'role', 'parentInvolvement', 'verifiedAt']) {
    if (!item[field]) problem(learningItemsFile, `${at} needs ${field}`)
  }
  if (!/^https?:\/\//.test(item.url ?? '')) problem(learningItemsFile, `${at} needs a url`)
  if (!item.stages?.length || item.stages.some((stage) => stageSubject.get(stage) !== item.subject)) {
    problem(learningItemsFile, `${at} stages must belong to its subject ${item.subject}`)
  }
  const evidence = item.evidence ?? {}
  if (!(evidence.public?.length || evidence.reviews?.length)) problem(learningItemsFile, `${at} needs public or review evidence`)
  for (const entry of evidence.public ?? []) {
    if (!entry.label || !/^https?:\/\//.test(entry.url ?? '')) problem(learningItemsFile, `${at} public evidence needs a label and url`)
  }
  for (const review of evidence.reviews ?? []) {
    if (!REVIEW_GRADES.has(review.grade)) problem(learningItemsFile, `${at} review grade must be A, B or C`)
    if (!/^https?:\/\//.test(review.url ?? '')) problem(learningItemsFile, `${at} review needs its source url`)
    if (review.disclosure !== '확인되지 않음') problem(learningItemsFile, `${at} review with a sponsorship disclosure must be dropped, not stored`)
    if (!review.checkedAt) problem(learningItemsFile, `${at} review needs checkedAt`)
    for (const field of ['good', 'bad']) {
      if (review[field] && [...review[field]].length > 60) problem(learningItemsFile, `${at} review ${field} is over 60 characters - summarise, do not quote`)
    }
  }
}
if (learningItems.some((item) => item.subject === 'english' && item.schoolLink !== 'outside')) {
  problem(learningItemsFile, 'english items are outside the grade-1 curriculum (principles 3절)')
}

if (problems.length) {
  throw new Error(`build-content: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
}

await fs.mkdir(path.dirname(outFile), { recursive: true })
await fs.writeFile(outFile, JSON.stringify({
  guides: guides.map(({ file: _file, ...guide }) => guide),
  faqs: faqs.map(({ file: _file, ...faq }) => faq),
}, null, 2), 'utf8')
const answers = faqs.reduce((n, faq) => n + faq.sections.reduce((m, section) => m + section.items.length, 0), 0)
process.stdout.write(`content     ${guides.length} guides, ${answers} FAQ answers in ${faqs.length} stage(s) -> ${path.relative(projectRoot, outFile)}\n`)
process.stdout.write(`grade 1     ${learningStages.subjects.reduce((n, subject) => n + subject.stages.length, 0)} stages, ${learningItems.length} items (validated)
`)
process.stdout.write(`curriculum  ${curriculumItems.length} items, ${curriculumPlans.length} cards (validated; the app reads src/content/curriculum directly)\n`)
