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

await fs.writeFile(path.join(outDir, 'app.html'), shell, 'utf8')
process.stdout.write('shell       dist/app.html (no canonical, no og:url)\n')
