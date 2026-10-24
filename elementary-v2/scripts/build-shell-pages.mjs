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
import { loadShowcase } from './home-showcase.mjs'

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

// The home's two rows (2026-10-15). seasonCards mirrors src/utils/homeShelves.ts;
// the static copy names the deadline date rather than a D-day, which would go
// stale between deploys - the app replaces it with the live count on mount.
const shelves = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/home-shelves.json'), 'utf8'))
const seasonCards = (items, now, max) => {
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const iso = `${now.getFullYear()}-${today}`
  const inWindow = (from, to) => (from <= to ? today >= from && today <= to : today >= from || today <= to)
  const until = (mmdd) => {
    const [month, day] = mmdd.split('-').map(Number)
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let target = new Date(now.getFullYear(), month - 1, day)
    if (target < start) target = new Date(now.getFullYear() + 1, month - 1, day)
    return Math.round((target - start) / 86_400_000)
  }
  return items
    .filter((item) => inWindow(item.from, item.to))
    .map((item, index) => ({ ...item, index, dday: item.deadline ? until(item.deadline) : null, isNew: Boolean(item.newUntil && iso <= item.newUntil) }))
    .sort((a, b) => (a.dday ?? 999) - (b.dday ?? 999) || a.index - b.index)
    .slice(0, max)
}
const showcase = await loadShowcase(shelves.showcase.schoolId)
if (showcase) await fs.writeFile(path.join(outDir, 'home-showcase.json'), JSON.stringify(showcase), 'utf8')
process.stdout.write(`showcase    ${showcase ? `dist/home-showcase.json (${showcase.school.name})` : 'none - the home leaves the row out'}\n`)

const seasonHtml = (() => {
  const cards = seasonCards(shelves.season.items, new Date(), shelves.season.max)
  if (!cards.length) return ''
  const badge = (card) => (card.deadline
    ? `<span class="season-card__badge">${escapeHtml(card.deadlineLabel)} ${Number(card.deadline.slice(0, 2))}월 ${Number(card.deadline.slice(3))}일</span>`
    : card.isNew ? '<span class="season-card__badge season-card__badge--new">NEW</span>' : '')
  return `<section class="home-shelf" aria-labelledby="home-season-title"><div class="home-shelf__head"><h2 id="home-season-title">${escapeHtml(shelves.season.title)}</h2></div><ul class="home-shelf__row">`
    + cards.map((card) => `<li><a href="${escapeHtml(card.href)}" class="season-card">${badge(card)}<strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.body)}</small></a></li>`).join('')
    + '</ul></section>'
})()

// Labels of src/utils/academyCategories.ts, for the static text only.
const ACADEMY_LABELS = { english: '영어', math: '수학', writing: '국어·논술', science: '과학', coding: '코딩', study: '입시·종합', language: '외국어', arts: '예능', sports: '체육' }

// Text-only for the crawler: the bars are drawn by the app.
const showcaseHtml = showcase ? (() => {
  const { school, apartment } = showcase
  const days = school.days.filter((day) => day.dismissal)
    .map((day) => `${day.label} 하교 ${day.dismissal}${day.afterschoolEnd ? `·방과후 ~${day.afterschoolEnd}` : ''}`).join(', ')
  return `<section class="home-shelf" aria-labelledby="home-showcase-title"><div class="home-shelf__head"><h2 id="home-showcase-title">${escapeHtml(shelves.showcase.title)}</h2><small>${escapeHtml(shelves.showcase.lead)}</small></div><ul class="home-shelf__row home-shelf__row--wide">`
    + `<li><a href="${escapeHtml(encodeURI(school.path))}" class="showcase-card"><span class="showcase-card__kicker">초1 오후 한눈에</span><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(days)}${school.careEnd ? `, 돌봄 ~${escapeHtml(school.careEnd)}` : ''}</small></a></li>`
    + (apartment ? `<li><a href="${escapeHtml(encodeURI(apartment.path))}" class="showcase-card"><span class="showcase-card__kicker">배정 학교 찾기</span><strong>${escapeHtml(apartment.name)} → ${escapeHtml(school.name)}</strong><small>1학년 ${school.grade1Students ?? '–'}명 · 학급당 ${school.grade1PerClass ?? '–'}명 · 배정 아파트 ${school.apartments}곳</small>`
      + (apartment.academies ? `<small>교육환경: 학원·교습소 400m ${apartment.academies.core ?? '–'}곳 · 800m ${apartment.academies.extended ?? '–'}곳 (${apartment.academies.categories.map(({ key, count }) => `${ACADEMY_LABELS[key] ?? key} ${count}`).join(', ')})</small>` : '')
      + '</a></li>' : '')
    + `<li><a href="/timetable?school=${encodeURIComponent(school.id)}" class="showcase-card"><span class="showcase-card__kicker">시간표 예시</span><strong>맞벌이 가정의 하루</strong><small>${school.morning ? `아침돌봄 ${escapeHtml(school.morning)}, ` : ''}하교 뒤 방과후와 돌봄을 이어 붙인 예시</small></a></li>`
    + '</ul></section>'
})() : ''

const homeBody = [
  '<section class="app-destination app-page home-page" aria-labelledby="home-title">',
  '<div class="home-hero"><div class="home-page__inner">',
  `<p class="home-page__brand">${escapeHtml(copy.brand)}</p>`,
  `<h1 id="home-title">${escapeHtml(copy.title)}</h1>`,
  `<p class="home-page__lead">${escapeHtml(copy.lead)}</p>`,
  `<p class="home-hero__trust"><span>${escapeHtml(copy.noteBefore)}<b>${escapeHtml(copy.noteStrong)}</b>${escapeHtml(copy.noteAfter)}</span></p>`,
  '</div></div>',
  '<div class="home-page__inner home-page__body">',
  seasonHtml,
  showcaseHtml,
  // Same banner as HomeShelves.tsx: the way from the examples into /timetable.
  '<a href="/timetable" class="timetable-banner"><span class="min-w-0 flex-1"><strong>우리 아이 초등학교 시간표 미리 짜보기</strong><small>맞춤형·방과후·돌봄에 주변 학원까지, 입학 전에 한 주를 그려 봐요</small></span></a>',
  // The guide list itself lives under /guide since 2026-10-04; the home links to it,
  // as the app does, rather than repeat it.
  '<div class="home-links">',
  '<a href="/guide" class="home-link"><span><strong>입학 준비 가이드</strong><small>시기별로 할 일을 공식 자료로</small></span></a>',
  '<a href="/faq" class="home-link"><span><strong>자주 묻는 질문</strong><small>이사·배정·취학통지서</small></span></a>',
  '</div>',
  `<a href="/map" class="home-page__card"><span class="min-w-0 flex-1"><strong>${escapeHtml(copy.mapCardTitle)}</strong><small>${escapeHtml(copy.mapCardBody)}</small></span></a>`,
  // Same section as HomePage.tsx: the region hubs, so a crawler reaches every
  // school in three links from the home rather than through the footer.
  `<section class="home-card home-areas" aria-labelledby="home-areas-title"><h2 id="home-areas-title">${escapeHtml(copy.areaCardTitle)}</h2><p>${escapeHtml(copy.areaCardBody)}</p><ul class="home-areas__list">`
    + copy.areaRegions.map((region) => `<li><a href="${escapeHtml(encodeURI(`/area/${region}`))}">${escapeHtml(region)}</a></li>`).join('')
    + '</ul></section>',
  `<a href="/learn" class="home-page__card"><span class="min-w-0 flex-1"><strong>${escapeHtml(copy.learnCardTitle)}</strong><small>${escapeHtml(copy.learnCardBody)}</small></span></a>`,
  '<footer class="home-page__footer"><a href="/area">지역별 학교 목록</a><a href="/privacy">개인정보처리방침</a></footer>',
  '</div></section>',
].join('')

// The site's identity for brand queries ("어디초"): WebSite + Organization. No
// SearchAction - Google retired the sitelinks search box in 2024.
const homeLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${siteOrigin()}/#website`, name: copy.brand, alternateName: 'wherecho', url: `${siteOrigin()}/`, inLanguage: 'ko-KR', publisher: { '@id': `${siteOrigin()}/#organization` } },
    { '@type': 'Organization', '@id': `${siteOrigin()}/#organization`, name: copy.brand, url: `${siteOrigin()}/`, logo: `${siteOrigin()}/logo.png`, description: '공식 학구도 기준 초등학교 배정 아파트, 학교 정보, 입학 준비 가이드' },
  ],
}
const home = built
  .replace('</head>', `  <script type="application/ld+json">${JSON.stringify(homeLd).replace(/</g, '\\u003c')}</script>\n    <link rel="alternate" type="application/rss+xml" title="어디초 입학 준비 가이드" href="${siteOrigin()}/guide/rss.xml">\n  </head>`)
  .replace(
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
// Structured data for answer engines (Google, Naver, AI search): what the page
// is, when it was checked, and what it cites. Same escaping as api/detail.js.
const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const publisher = { '@type': 'Organization', name: '어디초', url: siteOrigin() + '/' }
const breadcrumb = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, itemPath], index) => ({ '@type': 'ListItem', position: index + 1, name, item: siteOrigin() + encodeURI(itemPath) })),
})

const contentPage = ({ pagePath, title, description, body, jsonLd = null }) => {
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
    .replace('</head>', `  <link rel="canonical" href="${escapeHtml(url)}">\n    <meta property="og:url" content="${escapeHtml(url)}">\n${jsonLd ? `    ${ldScript(jsonLd)}\n` : ''}    <link rel="alternate" type="application/rss+xml" title="어디초 입학 준비 가이드" href="${siteOrigin()}/guide/rss.xml">\n  </head>`)
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
  + sources.map((source) => `<li>${source.official ? '<span class="content-sources__official">공식</span>' : ''}<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join('')
  + `</ul><p>내용 확인일 ${escapeHtml(verifiedAt)}</p></aside>`

// Same markup as src/components/content/AppliesTo.tsx.
const appliesHtml = (rule, basisYear) => '<p class="content-applies">'
  + `<span class="content-applies__chip content-applies__chip--${rule}">${escapeHtml(structure.rules[rule])}</span>`
  + `<span class="content-applies__chip">${escapeHtml(String(basisYear))}학년도 기준</span></p>`

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
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          headline: guide.title,
          description: guide.description,
          inLanguage: 'ko-KR',
          dateModified: guide.verifiedAt,
          mainEntityOfPage: siteOrigin() + encodeURI(`/guide/${guide.slug}`),
          author: publisher,
          publisher,
          citation: guide.sources.map((source) => ({ '@type': 'CreativeWork', name: source.label, url: source.url })),
        },
        breadcrumb([['어디초', '/'], ['입학 준비 가이드', '/guide'], [guide.title, `/guide/${guide.slug}`]]),
      ],
    },
    body: page([
      '<a class="content-page__back" href="/guide">입학 준비 가이드</a>',
      `<span class="stage-chip stage-chip--${guide.stage}">${escapeHtml(structure.stages[guide.stage].short)}</span>`,
      `<h1 id="guide-title">${escapeHtml(guide.title)}</h1>`,
      appliesHtml(guide.rule, guide.basisYear),
      guide.scope ? `<p class="content-page__scope">${escapeHtml(guide.scope)}</p>` : '',
      summaryHtml(guide.summary),
      `<div class="content-body">${guide.html}</div>`,
      sourcesHtml(guide.sources, guide.verifiedAt),
    ].join(''), 'guide-title'),
  }))
}

// Learning items (P2): only published ones are in content.json for a build, so
// only they get a page. Same markup as src/components/content/LearnItemPage.tsx.
const learningTaxonomy = JSON.parse(await fs.readFile(path.join(projectRoot, 'src', 'content', 'learning-taxonomy.json'), 'utf8'))
for (const item of content.learning ?? []) {
  if (item.status !== 'published') continue
  const category = learningTaxonomy.categories.find((entry) => entry.id === item.category)
  const sub = category?.subcategories.find((entry) => entry.id === item.subcategory)
  const back = category?.menu === 'guide' ? ['/guide', '입학 준비 가이드'] : ['/learn', '학습 준비']
  const ages = [...item.ages].sort((a, b) => a - b)
  const ageText = ages[0] !== ages[ages.length - 1] ? `만 ${ages[0]}~${ages[ages.length - 1]}세` : `만 ${ages[0]}세`
  const link = item.schoolLink
    ? `<div><dt>학교와의 연결</dt><dd><span class="learn-link learn-link--${item.schoolLink.level}">${escapeHtml(learningTaxonomy.schoolLinks[item.schoolLink.level])}</span>${item.schoolLink.basis ? `<span class="learn-link__basis">${escapeHtml(item.schoolLink.basis)}</span>` : ''}</dd></div>`
    : ''
  await writePage(`/learn/${item.slug}`, contentPage({
    pagePath: `/learn/${item.slug}`,
    title: `${item.title} | 어디초`,
    description: item.description,
    body: page([
      `<a class="content-page__back" href="${back[0]}">${back[1]}</a>`,
      `<span class="learn-category">${escapeHtml(category?.label ?? '')} · ${escapeHtml(sub?.label ?? item.subcategory)}</span>`,
      `<h1 id="learn-item-title">${escapeHtml(item.title)}</h1>`,
      `<div class="learn-answer"><strong>어디초 요약</strong><p>${escapeHtml(item.answer)}</p></div>`,
      `<dl class="learn-facts"><div><dt>대상</dt><dd>${ageText}</dd></div><div><dt>시기</dt><dd>${escapeHtml(item.timing)}</dd></div>${link}</dl>`,
      `<div class="content-body">${item.html}</div>`,
      `<p class="learn-editorial-note">${item.html.includes('<h2>학교에서는 이렇게 배워요</h2>') ? '‘학교에서는 이렇게 배워요’는 아래 근거 자료의 내용이고, ‘좋은 점·아쉬운 점·우리 집이라면’은 그 사실을 바탕으로 한 어디초의 편집 판단입니다.' : '‘좋은 점·아쉬운 점·우리 집이라면’은 아래 근거 자료를 바탕으로 한 어디초의 편집 판단입니다.'}</p>`,
      sourcesHtml(item.sources, item.verifiedAt),
    ].join(''), 'learn-item-title'),
  }))
}

await writePage('/faq', contentPage({
  pagePath: '/faq',
  title: `${structure.faqPage.title} | 어디초`,
  description: structure.faqPage.description,
  jsonLd: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        inLanguage: 'ko-KR',
        dateModified: content.faqs.map((faq) => faq.verifiedAt).sort().at(-1),
        mainEntity: content.faqs.flatMap((faq) => faq.sections.flatMap((section) => section.items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: plainText(item.html).replace(/\s*자세히$/, '') },
        })))),
      },
      breadcrumb([['어디초', '/'], ['자주 묻는 질문', '/faq']]),
    ],
  },
  body: page([
    `<h1 id="faq-title">${escapeHtml(structure.faqPage.title)}</h1>`,
    `<p class="content-page__lead">${escapeHtml(structure.faqPage.description)}</p>`,
    ...content.faqs.map((faq) => `<section class="faq-stage faq-stage--${faq.stage}"><header class="guide-stage__header"><span class="stage-chip stage-chip--${faq.stage}">${escapeHtml(structure.stages[faq.stage].short)}</span></header>`
      + `<h2 class="faq-stage__title">${escapeHtml(faq.title)}</h2>`
      + appliesHtml(faq.rule, faq.basisYear)
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
    + checklist.groups.map((group) => `<section class="checklist-card checklist-card--${group.id}"><header class="checklist-card__header"><span class="min-w-0 flex-1"><h2>${escapeHtml(group.label)}</h2><small>${escapeHtml(group.hint)}</small></span></header><ul class="checklist-rows">`
      + group.items.map((item) => `<li><label><span class="checklist-rows__text"><span>${escapeHtml(item.text)}</span><small>${escapeHtml(item.when)}</small></span></label></li>`).join('')
      + '</ul></section>').join('')
    + '</div></section>',
}))
process.stdout.write(`content     dist/guide/ (list + ${content.guides.length}), dist/faq/, dist/checklist/\n`)

// RSS for the guides and published learning items, so Naver (Search Advisor
// takes an RSS address) and readers pick up new and re-checked articles. The
// date is each article's check date - the date its content was last confirmed.
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rfc822 = (isoDate) => new Date(`${isoDate}T09:00:00+09:00`).toUTCString()
const feedItems = [
  ...content.guides.map((guide) => ({ title: guide.title, path: `/guide/${guide.slug}`, description: guide.description, date: guide.verifiedAt })),
  ...(content.learning ?? []).filter((item) => item.status === 'published')
    .map((item) => ({ title: item.title, path: `/learn/${item.slug}`, description: item.description, date: item.verifiedAt })),
].filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)))
  .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path))
const feed = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n'
  + `<title>어디초 입학 준비 가이드</title><link>${xml(siteOrigin() + '/guide')}</link>`
  + `<description>${xml(structure.guideList.description)}</description><language>ko</language>`
  + `<atom:link href="${xml(siteOrigin() + '/guide/rss.xml')}" rel="self" type="application/rss+xml"/>`
  + `<lastBuildDate>${rfc822(feedItems[0]?.date ?? new Date().toISOString().slice(0, 10))}</lastBuildDate>\n`
  + feedItems.map((item) => {
    const link = siteOrigin() + encodeURI(item.path)
    return `<item><title>${xml(item.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid>`
      + `<description>${xml(item.description)}</description><pubDate>${rfc822(item.date)}</pubDate></item>\n`
  }).join('')
  + '</channel></rss>\n'
await fs.writeFile(path.join(outDir, 'guide', 'rss.xml'), feed, 'utf8')
process.stdout.write(`rss         dist/guide/rss.xml (${feedItems.length} items)\n`)
