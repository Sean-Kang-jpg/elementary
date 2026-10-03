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

const problems = []
const problem = (file, message) => problems.push(`${path.relative(projectRoot, file)}: ${message}`)

const marked = new Marked({
  gfm: true,
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
  guides.push({
    slug,
    title: meta.title,
    description: meta.description,
    order: meta.order ?? 99,
    stage: meta.stage,
    group: meta.group ?? 'admission',
    verifiedAt: String(meta.verifiedAt),
    scope: meta.scope ?? null,
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
