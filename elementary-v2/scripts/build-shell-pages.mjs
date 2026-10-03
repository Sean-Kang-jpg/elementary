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
const homeBody = [
  '<section class="app-destination app-page home-page" aria-labelledby="home-title"><div class="home-page__inner">',
  `<p class="home-page__brand">${escapeHtml(copy.brand)}</p>`,
  `<h1 id="home-title">${escapeHtml(copy.title)}</h1>`,
  `<p class="home-page__lead">${escapeHtml(copy.lead)}</p>`,
  `<a href="/map" class="home-page__card"><span class="min-w-0 flex-1"><strong>${escapeHtml(copy.mapCardTitle)}</strong><small>${escapeHtml(copy.mapCardBody)}</small></span></a>`,
  `<p class="home-page__note">${escapeHtml(copy.noteBefore)}<b>${escapeHtml(copy.noteStrong)}</b>${escapeHtml(copy.noteAfter)}</p>`,
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
process.stdout.write('shell       dist/app.html (no canonical, no og:url)\n')
process.stdout.write('home        dist/index.html (prerendered home content)\n')
