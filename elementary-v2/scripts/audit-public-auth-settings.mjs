// Read-only public Auth settings. Never prints credentials or full config.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  const env = dotenv.parse(fs.readFileSync(path.join(root, '.env')))
  const base = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('missing_public_config')
  if (new URL(base).hostname !== 'vsgeksumgvcrkzjwvlgs.supabase.co') throw new Error('project_mismatch')
  const response = await fetch(`${base}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.log(JSON.stringify({ status: 'http_error', http_status: response.status }))
    process.exitCode = 1
  } else {
    const settings = await response.json()
    const boolean = (value) => typeof value === 'boolean' ? value : null
    console.log(JSON.stringify({
      status: 'ok',
      external: Object.fromEntries(['anonymous_users', 'google', 'kakao', 'email', 'phone'].map(name => [name, boolean(settings.external?.[name])])),
      disable_signup: boolean(settings.disable_signup),
      mailer_autoconfirm: boolean(settings.mailer_autoconfirm),
      phone_autoconfirm: boolean(settings.phone_autoconfirm),
    }, null, 2))
  }
} catch (error) {
  const safe = ['missing_public_config', 'project_mismatch'].includes(error.message) ? error.message : 'request_failed'
  console.log(JSON.stringify({ status: safe, name: error.name, code: error.cause?.code || null }))
  process.exitCode = 1
}
