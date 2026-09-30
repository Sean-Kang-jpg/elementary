import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { siteOrigin } from './scripts/site-origin.mjs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

/**
 * Fill the placeholders in index.html.
 *
 * The canonical link and og:url have to be absolute and have to be in the served
 * HTML, because a crawler may not run the page's JavaScript - so they cannot be
 * set at runtime, and they cannot be hardcoded either, or a domain move means
 * editing them by hand. Vite's own `%VAR%` substitution is not used: it leaves an
 * unknown name in the output verbatim, which would ship a canonical URL reading
 * `%VITE_SITE_ORIGIN%`. These tokens are replaced here, and the build then checks
 * that none survived.
 */
const stampHtml = () => ({
  name: 'stamp-html',
  transformIndexHtml: (html: string) => {
    const filled = html
      .replaceAll('{{SITE_ORIGIN}}', siteOrigin())
      .replaceAll('{{APP_VERSION}}', version)
    const leftover = filled.match(/\{\{[A-Z_]+\}\}/)
    if (leftover) throw new Error(`index.html has an unfilled placeholder: ${leftover[0]}`)
    return filled
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stampHtml()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    'process.env': {}
  }
})
