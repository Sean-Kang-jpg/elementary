import { supabase } from './supabase'

/**
 * Who is voting (PRD_CURRICULUM_SHARING C-2, C-8).
 *
 * A Supabase anonymous user, created on the first like and kept by supabase-js
 * in this browser's storage. Nothing about the person is collected: no e-mail,
 * no profile. The same browser cannot like a target twice (SQL 24's primary
 * key); a new browser or a private window is a new voter, which is the accepted
 * limit of this design.
 *
 * When VITE_TURNSTILE_SITE_KEY is set, the sign-in carries a Cloudflare
 * Turnstile token, which Supabase verifies once captcha protection is turned on
 * for the project. The key is public by design, like every VITE_ variable. With
 * it unset the sign-in goes without a token — that works only while captcha is
 * off in Supabase, so the two must be switched together.
 */

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptRequest: Promise<TurnstileApi> | null = null
const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptRequest) {
    scriptRequest = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT
      script.async = true
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'))
      script.onerror = () => {
        scriptRequest = null
        reject(new Error('turnstile script failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptRequest
}

/** An invisible Turnstile challenge; resolves with the token it issues. */
const captchaToken = async (siteKey: string): Promise<string> => {
  const turnstile = await loadTurnstile()
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.bottom = '0'
  host.style.left = '0'
  host.style.zIndex = '2147483647'
  document.body.appendChild(host)
  try {
    return await new Promise<string>((resolve, reject) => {
      const widget = turnstile.render(host, {
        sitekey: siteKey,
        size: 'flexible',
        appearance: 'interaction-only',
        callback: (token: string) => resolve(token),
        'error-callback': () => reject(new Error('turnstile challenge failed')),
        'timeout-callback': () => reject(new Error('turnstile challenge timed out')),
      })
      window.setTimeout(() => {
        try { turnstile.remove(widget) } catch { /* already gone */ }
      }, 120_000)
    })
  } finally {
    host.remove()
  }
}

/** The current voter's id, or null when this browser has not voted yet. */
export const currentVoter = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

let signingIn: Promise<string> | null = null

/** The voter's id, creating the anonymous user on first use. */
export const ensureVoter = async (): Promise<string> => {
  const existing = await currentVoter()
  if (existing) return existing
  if (!signingIn) {
    signingIn = (async () => {
      const options = TURNSTILE_SITE_KEY ? { captchaToken: await captchaToken(TURNSTILE_SITE_KEY) } : undefined
      const { data, error } = await supabase.auth.signInAnonymously(options ? { options } : undefined)
      if (error || !data.user) throw error ?? new Error('anonymous sign-in returned no user')
      return data.user.id
    })().finally(() => { signingIn = null })
  }
  return signingIn
}
