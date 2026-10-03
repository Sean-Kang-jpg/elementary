/**
 * Turn the guide and FAQ markdown into one JSON file both renderers read.
 *
 *     src/content/guides/*.md  ─┐
 *     src/content/faq.md       ─┴─>  src/content/generated/content.json
 *
 * The app imports the JSON; scripts/build-shell-pages.mjs writes the same HTML
 * into static pages for crawlers (ADR-008 section 4). One conversion, so the page
 * a crawler indexes and the page a visitor reads cannot drift.
 *
 * It fails rather than publishing something wrong. Every claim in these pages is
 * about an official procedure (PRD v2 principles 6 and 8), so a page without its
 * sources or its verification date does not build; neither does a link to a
 * guide that does not exist, or a description longer than Naver shows.
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
}

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
    group: meta.group ?? 'admission',
    verifiedAt: String(meta.verifiedAt),
    scope: meta.scope ?? null,
    sources: meta.sources ?? [],
    html: marked.parse(body),
    body,
    file,
  })
}
guides.sort((a, b) => a.order - b.order)

// The FAQ is one page of sections (##) holding questions (###). A blockquote
// after the last question is the page's closing note.
const faqFile = path.join(contentDir, 'faq.md')
const faqSource = await readMarkdown(faqFile)
checkCommon(faqFile, faqSource.meta)
const sections = []
let note = null
let current = null
for (const token of marked.lexer(faqSource.body)) {
  if (token.type === 'heading' && token.depth === 2) {
    sections.push({ heading: token.text, items: [] })
    current = null
  } else if (token.type === 'heading' && token.depth === 3) {
    if (!sections.length) problem(faqFile, `question "${token.text}" is outside any ## section`)
    current = { question: token.text, tokens: [] }
    sections.at(-1)?.items.push(current)
  } else if (current) {
    // A blockquote under the last question is the page note; that is decided
    // after the loop, by position.
    current.tokens.push(token)
  }
}
const lastSection = sections.at(-1)
const lastItem = lastSection?.items.at(-1)
if (lastItem && lastItem.tokens.at(-1)?.type === 'blockquote') {
  note = marked.parser([lastItem.tokens.pop()])
}
const faq = {
  title: faqSource.meta.title,
  description: faqSource.meta.description,
  verifiedAt: String(faqSource.meta.verifiedAt),
  sources: faqSource.meta.sources ?? [],
  note,
  sections: sections.map((section) => ({
    heading: section.heading,
    items: section.items.map((item) => ({
      question: item.question,
      html: marked.parser(Object.assign(item.tokens, { links: {} })),
    })),
  })),
}
if (!faq.sections.some((section) => section.items.length)) problem(faqFile, 'no questions found')

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
faq.sections.forEach((section) => section.items.forEach((item) => checkLinks(faqFile, item.html)))

if (problems.length) {
  throw new Error(`build-content: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
}

await fs.mkdir(path.dirname(outFile), { recursive: true })
await fs.writeFile(outFile, JSON.stringify({
  guides: guides.map(({ body: _body, file: _file, ...guide }) => guide),
  faq,
}, null, 2), 'utf8')
process.stdout.write(`content     ${guides.length} guides, ${faq.sections.reduce((n, s) => n + s.items.length, 0)} FAQ answers -> ${path.relative(projectRoot, outFile)}\n`)
