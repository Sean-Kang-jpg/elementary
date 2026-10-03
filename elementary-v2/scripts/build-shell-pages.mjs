/**
 * Split the built index.html into the two pages it has been serving as one.
 *
 * dist/index.html was both the page at `/` and the application shell that every
 * other path rewrites to and that api/detail.js wraps around a detail page. Once
 * `/` becomes a home with its own content and canonical, those roles conflict:
 * /map would ship the home's canonical. So the shell gets its own file
 * (ADR-008 section 3):
 *
 *     dist/app.html    the shell. No canonical and no og:url - it is served at
 *                      many addresses, so it cannot name one of them.
 *     dist/index.html  the home. Keeps the canonical `/` and gets the home's
 *                      content in #root, so a crawler that runs no JavaScript
 *                      reads the page (ADR-008 section 4).
 *
 * The home content sits between `<!--prerender:home-->` markers. api/detail.js
 * falls back to index.html when app.html is missing and replaces exactly that
 * span; React's createRoot replaces it for a visitor.
 *
 * Runs after `vite build` and before the sitemaps. It fails the build rather than
 * writing something wrong: every detail page and every non-home path depends on
 * this file, and a deploy without it must not reach production.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteOrigin } from './site-origin.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(projectRoot, 'dist')

const fail = (message) => {
  throw new Error(`build-shell-pages: ${message}`)
}

const built = await fs.readFile(path.join(outDir, 'index.html'), 'utf8')

const shell = built
  .replace(/[ \t]*<link rel="canonical"[^>]*>\n?/i, '')
  .replace(/[ \t]*<meta property="og:url"[^>]*>\n?/i, '')

if (!shell.includes('<div id="root"></div>')) fail('the shell has no empty #root to mount into')
if (!/<script type="module"[^>]+src="\/assets\//.test(shell)) fail('the shell does not load the app bundle')
if (/rel="canonical"/.test(shell) || /og:url/.test(shell)) fail('the shell still names an address')

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// The same file HomePage.tsx renders from, so the crawler's home and the
// visitor's home cannot say different things. Class names match the component
// so the page looks the same in the moment before the app takes over.
const copy = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/home.json'), 'utf8'))
const content = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/generated/content.json'), 'utf8'))

const structure = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/structure.json'), 'utf8'))
const STAGE_ORDER = ['planning', 'admission']

// The home's guides, one card per stage, as the app shows them before a year is picked.
const homeStagesHtml = () => STAGE_ORDER.map((stage) => {
  const guides = content.guides.filter((guide) => guide.stage === stage)
  if (!guides.length) return ''
  return `<section class="home-stage home-stage--${stage}"><header><span class="stage-chip stage-chip--${stage}">${escapeHtml(structure.stages[stage].short)}</span></header>`
    + `<h2>${escapeHtml(structure.stages[stage].homeTitle)}</h2><ul>`
    + guides.map((guide) => `<li><a href="/guide/${guide.slug}"><span>${escapeHtml(guide.title)}</span></a></li>`).join('')
    + '</ul></section>'
}).join('')

const homeBody = [
  '<section class="app-destination app-page home-page" aria-labelledby="home-title">',
  '<div class="home-hero"><div class="home-page__inner">',
  `<p class="home-page__brand">${escapeHtml(copy.brand)}</p>`,
  `<h1 id="home-title">${escapeHtml(copy.title)}</h1>`,
  `<p class="home-page__lead">${escapeHtml(copy.lead)}</p>`,
  `<p class="home-hero__trust"><span>${escapeHtml(copy.noteBefore)}<b>${escapeHtml(copy.noteStrong)}</b>${escapeHtml(copy.noteAfter)}</span></p>`,
  '</div></div>',
  '<div class="home-page__inner home-page__body">',
  homeStagesHtml(),
  '<p><a href="/faq">자주 묻는 질문</a></p>',
  `<a href="/map" class="home-page__card"><span class="min-w-0 flex-1"><strong>${escapeHtml(copy.mapCardTitle)}</strong><small>${escapeHtml(copy.mapCardBody)}</small></span></a>`,
  '<footer class="home-page__footer"><a href="/privacy">개인정보처리방침</a></footer>',
  '</div></section>',
].join('')

const home = built.replace(
  '<div id="root"></div>',
  `<div id="root"><!--prerender:home-->${homeBody}<!--/prerender:home--></div>`,
)
if (!home.includes('<!--prerender:home-->')) fail('the home content was not placed in #root')
if (!/<link rel="canonical" href="[^"]+\/">/.test(home)) fail('the home lost its canonical')

await fs.writeFile(path.join(outDir, 'app.html'), shell, 'utf8')
await fs.writeFile(path.join(outDir, 'index.html'), home, 'utf8')
// Vercel serves this for a rewrite that lands on a missing file - an unknown
// guide address. The app opens there and shows the guide list.
await fs.writeFile(path.join(outDir, '404.html'), shell, 'utf8')
process.stdout.write('shell       dist/app.html, dist/404.html (no canonical, no og:url)\n')
process.stdout.write('home        dist/index.html (prerendered home content)\n')

// Guides and the FAQ (ADR-008 section 4). Each is a static file with its own
// head and its content in #root, built from the same JSON the app renders.
const contentPage = ({ pagePath, title, description, body }) => {
  const url = siteOrigin() + encodeURI(pagePath)
  const replaceOnce = (html, pattern, replacement, what) => {
    if (!pattern.test(html)) fail(`the shell has no ${what} to replace for ${pagePath}`)
    return html.replace(pattern, replacement)
  }
  let html = shell
  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`, 'title')
  html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`, 'description')
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`, 'og:title')
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`, 'og:description')
  html = html
    .replace('</head>', `  <link rel="canonical" href="${escapeHtml(url)}">\n    <meta property="og:url" content="${escapeHtml(url)}">\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  if ((html.match(/rel="canonical"/g) || []).length !== 1) fail(`${pagePath} must declare exactly one canonical`)
  return html
}

const writePage = async (pagePath, html) => {
  const file = path.join(outDir, pagePath.replace(/^\//, ''), 'index.html')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, html, 'utf8')
}

const sourcesHtml = (sources, verifiedAt) => '<aside class="content-sources" aria-label="근거 자료"><h2>근거 자료</h2><ul>'
  + sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join('')
  + `</ul><p>내용 확인일 ${escapeHtml(verifiedAt)}</p></aside>`

// Same markup as src/components/content/GuideSummary.tsx.
const summaryHtml = (summary) => {
  if (!summary) return ''
  const list = summary.kind === 'checks' ? 'ul' : 'ol'
  return `<figure class="guide-summary guide-summary--${summary.kind}"><figcaption>${escapeHtml(summary.title)}</figcaption><${list} class="guide-summary__items">`
    + summary.items.map((item, index) => '<li class="guide-summary__item">'
      + `<span class="guide-summary__marker" aria-hidden="true">${summary.kind === 'checks' ? '✓' : index + 1}</span>`
      + '<span class="guide-summary__body">'
      + (item.when ? `<span class="guide-summary__when">${escapeHtml(item.when)}</span>` : '')
      + `<strong>${escapeHtml(item.title)}</strong>`
      + (item.text ? `<small>${escapeHtml(item.text)}</small>` : '')
      + '</span></li>').join('')
    + `</${list}></figure>`
}

const page = (inner, labelledBy) =>
  `<section class="app-destination app-page content-page" aria-labelledby="${labelledBy}"><article class="content-page__inner">${inner}</article></section>`

const listBody = page([
  `<h1 id="guides-title">${escapeHtml(structure.guideList.title)}</h1>`,
  `<p class="content-page__lead">${escapeHtml(structure.guideList.lead)}</p>`,
  ...STAGE_ORDER.map((stage) => `<section class="guide-stage guide-stage--${stage}"><header class="guide-stage__header"><span class="stage-chip stage-chip--${stage}">${escapeHtml(structure.stages[stage].short)}</span></header>`
    + structure.groups.filter((group) => group.stage === stage).map((group) => {
      const items = content.guides.filter((guide) => guide.group === group.id)
      if (!items.length) return ''
      return `<div class="content-list"><h2>${escapeHtml(group.label)}</h2><ol class="guide-timeline">`
        + items.map((guide) => `<li><a class="content-list__item" href="/guide/${guide.slug}"><span><strong>${escapeHtml(guide.title)}</strong><small>${escapeHtml(guide.description)}</small></span></a></li>`).join('')
        + '</ol></div>'
    }).join('')
    + '</section>'),
  '<section class="content-list"><h2>더 보기</h2>',
  '<a class="content-list__item content-list__item--card" href="/faq"><span><strong>자주 묻는 질문</strong><small>이사 시기, 배정 학교, 취학통지서, 예비소집, 입학 연기</small></span></a>',
  '<a class="content-list__item content-list__item--card" href="/news"><span><strong>데이터 리포트</strong><small>학교별 배정 아파트의 세대수·연식·주차를 한눈에</small></span></a>',
  '</section>',
].join(''), 'guides-title')
await writePage('/guide', contentPage({
  pagePath: '/guide',
  title: `${structure.guideList.title} | 어디초`,
  description: structure.guideList.description,
  body: listBody,
}))

for (const guide of content.guides) {
  await writePage(`/guide/${guide.slug}`, contentPage({
    pagePath: `/guide/${guide.slug}`,
    title: `${guide.title} | 어디초`,
    description: guide.description,
    body: page([
      '<a class="content-page__back" href="/guide">입학 준비 가이드</a>',
      `<span class="stage-chip stage-chip--${guide.stage}">${escapeHtml(structure.stages[guide.stage].short)}</span>`,
      `<h1 id="guide-title">${escapeHtml(guide.title)}</h1>`,
      guide.scope ? `<p class="content-page__scope">${escapeHtml(guide.scope)}</p>` : '',
      summaryHtml(guide.summary),
      `<div class="content-body">${guide.html}</div>`,
      sourcesHtml(guide.sources, guide.verifiedAt),
    ].join(''), 'guide-title'),
  }))
}

await writePage('/faq', contentPage({
  pagePath: '/faq',
  title: `${structure.faqPage.title} | 어디초`,
  description: structure.faqPage.description,
  body: page([
    `<h1 id="faq-title">${escapeHtml(structure.faqPage.title)}</h1>`,
    `<p class="content-page__lead">${escapeHtml(structure.faqPage.description)}</p>`,
    ...content.faqs.map((faq) => `<section class="faq-stage faq-stage--${faq.stage}"><header class="guide-stage__header"><span class="stage-chip stage-chip--${faq.stage}">${escapeHtml(structure.stages[faq.stage].short)}</span></header>`
      + `<h2 class="faq-stage__title">${escapeHtml(faq.title)}</h2>`
      + faq.sections.map((section) => `<section class="faq-section"><h3>${escapeHtml(section.heading)}</h3>`
        + section.items.map((item) => `<details class="faq-item"><summary>${escapeHtml(item.question)}</summary><div class="content-body">${item.html}</div></details>`).join('')
        + '</section>').join('')
      + (faq.note ? `<div class="content-body content-page__note">${faq.note}</div>` : '')
      + sourcesHtml(faq.sources, faq.verifiedAt)
      + '</section>'),
  ].join(''), 'faq-title'),
}))
// The checklist: the static page lists the items for a crawler; the boxes and
// their saved state exist only once the app mounts.
const checklist = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/checklist.json'), 'utf8'))
await writePage('/checklist', contentPage({
  pagePath: '/checklist',
  title: `${checklist.title} | 어디초`,
  description: checklist.description,
  body: `<section class="app-destination app-page content-page" aria-labelledby="checklist-title"><div class="content-page__inner">`
    + `<h1 id="checklist-title">${escapeHtml(checklist.title)}</h1><p class="content-page__lead">${escapeHtml(checklist.description)}</p>`
    + checklist.groups.map((group) => `<section class="checklist-group"><h2>${escapeHtml(group.label)}</h2><ul>`
      + group.items.map((item) => `<li><label><span>${escapeHtml(item.text)}</span><small class="checklist-when">${escapeHtml(item.when)}</small></label></li>`).join('')
      + '</ul></section>').join('')
    + '</div></section>',
}))
process.stdout.write(`content     dist/guide/ (list + ${content.guides.length}), dist/faq/, dist/checklist/\n`)
