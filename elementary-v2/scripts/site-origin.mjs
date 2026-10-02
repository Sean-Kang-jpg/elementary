/**
 * The site's public origin, in one place.
 *
 * Everything that has to print an absolute address reads it from here: the
 * canonical link and og:url stamped into index.html, the Sitemap directive in
 * robots.txt, and every <loc> in the sitemaps. Five files used to carry the
 * literal, which is the shape of problem where four of them get updated.
 *
 * A domain move is therefore one environment variable, plus registering the new
 * host with Naver Cloud - the maps key is protected by a host allowlist, so an
 * unregistered domain loads the page and then fails to draw a map.
 *
 * The serverless prerender (../../api/detail.js) cannot import this file: it is
 * deployed from the repository root, outside this package. It reads the same
 * variable and carries the same fallback, and public-smoke.mjs asserts that what
 * the two of them actually serve agrees - a check beats a promise.
 */

const FALLBACK = 'https://wherecho.co.kr'

export const siteOrigin = () =>
  (process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN || FALLBACK).replace(/\/+$/, '')

export const siteOriginIsDefault = () =>
  !process.env.SITE_ORIGIN && !process.env.VITE_SITE_ORIGIN
