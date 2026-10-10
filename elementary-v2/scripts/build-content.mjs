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
// 적용 범위(P1-04): 법령상 전국이 같은가, 교육감·학교가 정해 지역마다 다른가, 둘이 섞였나.
const RULES = ['national', 'regional', 'mixed']

/**
 * 정부·지자체·교육청·법령 사이트를 '공식'으로 표시한다. 주소로 판별하므로 문서에 따로
 * 적지 않는다. 공공기관이라도 .go.kr·gov.kr 밖(예: .or.kr)은 공식으로 치지 않는다 — 기준을
 * 하나로 두어야 표시가 흔들리지 않는다.
 */
const isOfficial = (url) => {
  try {
    const host = new URL(url).hostname
    return host.endsWith('.go.kr') || host === 'gov.kr' || host.endsWith('.gov.kr')
  } catch {
    return false
  }
}
const withOfficial = (sources) => (sources ?? []).map((source) => ({ label: source.label, url: source.url, official: isOfficial(source.url) }))
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
  if (!RULES.includes(meta.rule)) problem(file, `rule must be one of ${RULES.join(', ')}`)
  if (!Number.isInteger(meta.basisYear) || meta.basisYear < 2025 || meta.basisYear > 2035) {
    problem(file, 'basisYear must be the school year the dates and examples are based on (e.g. 2026)')
  }
  if (Array.isArray(meta.sources) && !meta.sources.some((source) => isOfficial(source?.url))) {
    problem(file, 'at least one source must be official (.go.kr or gov.kr)')
  }
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
    rule: meta.rule,
    basisYear: meta.basisYear,
    sources: withOfficial(meta.sources),
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
    rule: meta.rule,
    basisYear: meta.basisYear,
    sources: withOfficial(meta.sources),
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
const APP_PATHS = new Set(['/', '/map', '/guide', '/faq', '/checklist', '/learn'])
// 학습 글은 아래에서 읽으므로 검사를 미룬다. 체크리스트는 운영에 나가므로 발행된 글만 가리킬 수 있다.
const pendingLearnLinks = []
const checkPath = (file, link) => {
  if (!link) return
  const learn = link.match(/^\/learn\/([^/?#]+)$/)
  if (learn) {
    pendingLearnLinks.push({ file, link, slug: learn[1] })
    return
  }
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

// Learning and everyday preparation (P2) ------------------------------------
// One question per file. Rules the plan makes non-negotiable are enforced here so
// they hold when the editor is in a hurry (PLATFORM_EXPANSION_LEARNING_INPUTS B11):
// no source, a sponsored reaction kept, a quoted-length reaction summary, a
// learning item without its school link and the unit behind it, English shown as
// school preparation. Only `published` items leave this script unless --preview
// (npm run dev) asks for the rest, so a draft never reaches the production bundle.

const PREVIEW = process.argv.includes('--preview')
const learningTaxonomy = JSON.parse(await fs.readFile(path.join(contentDir, 'learning-taxonomy.json'), 'utf8'))
const LEARNING_STATUSES = ['draft', 'review', 'published', 'archived']
const SCHOOL_LINKS = Object.keys(learningTaxonomy.schoolLinks)
const SOURCE_TYPES = Object.keys(learningTaxonomy.sourceTypes)
const SIGNAL_GRADES = ['A', 'B', 'C']
const SIGNAL_SUMMARY_LIMIT = 60
const ANSWER_LIMIT = 160
const LEARNING_SECTIONS = ['이런 점이 좋아요', '이런 점은 아쉬워요', '우리 집이라면']
// 불안·선행 경쟁을 부추기는 표현(P2-07, docs/product/LEARNING_EDITORIAL_CHECKLIST.md). 질문을 인용할 때도
// 이 말들은 쓰지 않는다 — 걸리면 문장을 바꾼다.
const ANXIETY_PHRASES = ['뒤처', '필수 선행', '선행 필수', '안 하면 늦', '남들보다', '상위권', '최소한 여기까지', '반드시 끝내']
const categoryById = new Map(learningTaxonomy.categories.map((category) => [category.id, category]))
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
const isUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const learningDir = path.join(contentDir, 'learning')
const learningFiles = (await fs.readdir(learningDir).catch(() => []))
  .filter((name) => name.endsWith('.md'))
  .map((name) => path.join(learningDir, name))

const learningAll = []
for (const file of learningFiles) {
  const { meta, body } = await readMarkdown(file)
  const slug = path.basename(file, '.md')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) problem(file, 'file name must be a lowercase-hyphen slug')
  for (const field of ['title', 'description', 'answer', 'timing']) {
    if (!meta[field]) problem(file, `front matter needs ${field}`)
  }
  if (meta.description && [...String(meta.description)].length > DESCRIPTION_LIMIT) problem(file, `description is over ${DESCRIPTION_LIMIT} characters`)
  if (meta.answer && [...String(meta.answer)].length > ANSWER_LIMIT) problem(file, `answer is over ${ANSWER_LIMIT} characters`)
  if (!String(meta.title ?? '').trim().endsWith('?')) problem(file, 'title must be the parent question, ending with ?')
  if (!isDate(meta.verifiedAt)) problem(file, 'verifiedAt must be YYYY-MM-DD')
  if (!LEARNING_STATUSES.includes(meta.status)) problem(file, `status must be one of ${LEARNING_STATUSES.join(', ')}`)
  const category = categoryById.get(meta.category)
  if (!category) problem(file, `category must be one of ${[...categoryById.keys()].join(', ')}`)
  else if (!category.subcategories.some((sub) => sub.id === meta.subcategory)) problem(file, `subcategory "${meta.subcategory}" is not in ${meta.category}`)
  if (!Array.isArray(meta.ages) || !meta.ages.length || meta.ages.some((age) => !Number.isInteger(age) || age < 3 || age > 8)) {
    problem(file, 'ages must list the 만 나이 it is for, 3 to 8')
  }

  // School link: learning only, and always with the unit or standard behind it.
  const link = meta.schoolLink ?? null
  if (meta.category === 'learning') {
    if (!link || !SCHOOL_LINKS.includes(link.level)) problem(file, `learning items need schoolLink.level (${SCHOOL_LINKS.join(', ')})`)
    else if (link.level !== 'outside' && !String(link.basis ?? '').trim()) problem(file, 'schoolLink.basis must name the unit or standard')
    if (meta.subcategory === 'english' && link?.level !== 'outside') problem(file, 'English is not taught in grade 1: schoolLink.level must be outside')
  } else if (link) problem(file, 'schoolLink is for learning items only')

  const sources = Array.isArray(meta.sources) ? meta.sources : []
  if (!sources.length) problem(file, 'front matter needs sources')
  sources.forEach((source, index) => {
    if (!source?.label || !isUrl(source?.url)) problem(file, `source ${index + 1} needs a label and an http(s) url`)
    if (!SOURCE_TYPES.includes(source?.type)) problem(file, `source ${index + 1} type must be one of ${SOURCE_TYPES.join(', ')}`)
    if (source?.type === 'official' && !isOfficial(source.url)) problem(file, `source ${index + 1} is typed official but ${source.url} is not a .go.kr/gov.kr address`)
  })

  // Parent reactions: attributes only, never the post itself.
  const signals = Array.isArray(meta.signals) ? meta.signals : []
  signals.forEach((signal, index) => {
    const where = `signal ${index + 1}`
    if (!isUrl(signal?.url)) problem(file, `${where} needs the original url`)
    if (!SIGNAL_GRADES.includes(signal?.grade)) problem(file, `${where} grade must be A, B or C`)
    if (!['positive', 'negative', 'conditional'].includes(signal?.tone)) problem(file, `${where} tone must be positive, negative or conditional`)
    if (signal?.disclosure !== 'none_found') problem(file, `${where} must be dropped: only reactions with no sponsorship or affiliate disclosure found are kept`)
    if (!signal?.summary || [...String(signal.summary)].length > SIGNAL_SUMMARY_LIMIT) problem(file, `${where} summary must be our own words, at most ${SIGNAL_SUMMARY_LIMIT} characters`)
    if (!isDate(signal?.checkedAt)) problem(file, `${where} needs checkedAt`)
  })

  const html = marked.parse(body)
  const wording = `${meta.title ?? ''} ${meta.description ?? ''} ${meta.answer ?? ''} ${html.replace(/<[^>]+>/g, ' ')}`
  for (const phrase of ANXIETY_PHRASES) {
    if (wording.includes(phrase)) problem(file, `uses "${phrase}" — rewrite without anxiety or competition (P2-07)`)
  }
  for (const heading of LEARNING_SECTIONS) {
    if (!html.includes(`<h2>${heading}</h2>`)) problem(file, `body needs the section "## ${heading}"`)
  }
  learningAll.push({
    slug,
    title: meta.title,
    description: meta.description,
    answer: meta.answer,
    category: meta.category,
    subcategory: meta.subcategory,
    status: meta.status,
    verifiedAt: String(meta.verifiedAt),
    ages: meta.ages ?? [],
    timing: meta.timing,
    schoolLink: link ? { level: link.level, basis: link.basis ?? null } : null,
    sources: sources.map((source) => ({ label: source.label, url: source.url, type: source.type, official: isOfficial(source.url) })),
    signals: signals.map(({ url, grade, tone, summary, checkedAt }) => ({ url, grade, tone, summary, checkedAt })),
    related: Array.isArray(meta.related) ? meta.related : [],
    html,
    file,
  })
}

const learning = learningAll.filter((item) => PREVIEW || item.status === 'published')
for (const item of learningAll) {
  checkLinks(item.file, item.html)
  checkMarkup(item.file, item.html)
  for (const related of item.related) {
    const guide = String(related).match(/^\/guide\/([^/?#]+)$/)
    const learn = String(related).match(/^\/learn\/([^/?#]+)$/)
    if (guide ? !slugs.has(guide[1]) : !learn || !learningAll.some((other) => other.slug === learn[1])) {
      problem(item.file, `related ${related} does not exist`)
    } else if (learn && item.status === 'published' && !learningAll.some((other) => other.slug === learn[1] && other.status === 'published')) {
      problem(item.file, `published item points to ${related}, which is not published`)
    }
  }
  for (const [, target] of item.html.matchAll(/href="\/learn\/([^"#?]+)"/g)) {
    if (!learningAll.some((other) => other.slug === target)) problem(item.file, `links to /learn/${target}, which does not exist`)
  }
}

for (const { file, link, slug } of pendingLearnLinks) {
  if (!learningAll.some((item) => item.slug === slug && item.status === 'published')) problem(file, `links to ${link}, which is not a published learning item`)
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

if (problems.length) {
  throw new Error(`build-content: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
}

await fs.mkdir(path.dirname(outFile), { recursive: true })
await fs.writeFile(outFile, JSON.stringify({
  guides: guides.map(({ file: _file, ...guide }) => guide),
  faqs: faqs.map(({ file: _file, ...faq }) => faq),
  learning: learning.map(({ file: _file, ...item }) => item),
}, null, 2), 'utf8')
const answers = faqs.reduce((n, faq) => n + faq.sections.reduce((m, section) => m + section.items.length, 0), 0)
process.stdout.write(`content     ${guides.length} guides, ${answers} FAQ answers in ${faqs.length} stage(s) -> ${path.relative(projectRoot, outFile)}\n`)
process.stdout.write(`learning    ${learning.length} of ${learningAll.length} items (${PREVIEW ? 'preview: every status' : 'published only'})\n`)
process.stdout.write(`curriculum  ${curriculumItems.length} items, ${curriculumPlans.length} cards (validated; the app reads src/content/curriculum directly)\n`)
