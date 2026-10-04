// /admin/etl end to end: log in as the smoke account, then check that the
// dashboard reads every panel through RLS as a registered ETL admin.
//
//   npm run browser:smoke:admin -- http://localhost:3000
//   npm run browser:smoke:admin -- https://wherecho.co.kr
//
// The account is a dedicated, non-personal Auth user registered in
// etl_admin_users, so the check can run against production without anyone's
// own login. Its credentials come from ADMIN_SMOKE_EMAIL / ADMIN_SMOKE_PASSWORD
// in the environment or in elementary-v2/.env, and are never printed.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(projectRoot, 'node_modules', 'agent-browser', 'bin', 'agent-browser.js')
const baseUrl = process.argv[2] || 'http://127.0.0.1:3000'
const session = `elementary-admin-smoke-${process.pid}`
const namespace = 'elementary-smoke'

const envFile = (name) => {
  try {
    const line = fs.readFileSync(path.join(projectRoot, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') : ''
  } catch {
    return ''
  }
}
const email = process.env.ADMIN_SMOKE_EMAIL || envFile('ADMIN_SMOKE_EMAIL')
const password = process.env.ADMIN_SMOKE_PASSWORD || envFile('ADMIN_SMOKE_PASSWORD')
if (!email || !password) {
  console.error('ADMIN_SMOKE_EMAIL and ADMIN_SMOKE_PASSWORD are required (environment or .env)')
  process.exit(2)
}

const run = (args, { quiet = false } = {}) => {
  const result = spawnSync(process.execPath, [cli, '--namespace', namespace, '--session', session, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 45_000,
  })
  if (!quiet && result.stdout.trim()) process.stdout.write(`${result.stdout.trim()}\n`)
  if (result.status !== 0) throw new Error(result.stderr.trim() || `agent-browser ${args[0]} failed`)
  return result.stdout.trim()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (condition, message, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const probe = run(['eval', `(() => { try { return (${condition}) ? 'READY' : 'WAITING' } catch { return 'WAITING' } })()`], { quiet: true })
    if (probe.includes('READY')) {
      console.log(`PASS: ${message}`)
      return
    }
    if (Date.now() >= deadline) throw new Error(`${message} — not true after ${timeoutMs}ms`)
    await sleep(300)
  }
}

try {
  run(['open', new URL('/admin/etl', baseUrl).toString()])
  await waitFor("document.querySelector('form.etl-login-panel input[type=email]')", 'the admin page asks for a login')
  // Typed, not echoed: agent-browser's own output for fill is suppressed below.
  run(['fill', 'form.etl-login-panel input[type=email]', email], { quiet: true })
  run(['fill', 'form.etl-login-panel input[type=password]', password], { quiet: true })
  run(['click', 'form.etl-login-panel button[type=submit]'], { quiet: true })

  await waitFor(
    "[...document.querySelectorAll('h1')].some((h) => h.textContent.includes('ETL 모니터링'))",
    'the smoke account is let in as an ETL admin',
  )
  await waitFor(
    "['주기·범위별 업데이트 상태', '최근 실행', '원천 스냅샷', '최근 검증 지표']"
    + ".every((title) => [...document.querySelectorAll('h2')].some((h) => h.textContent.includes(title)))",
    'every dashboard panel is drawn',
  )
  await waitFor(
    "document.querySelectorAll('.etl-table-wrap tbody tr').length > 0",
    'the dashboard read schedule, run and snapshot rows through RLS',
  )
  // Leave no session behind in the shared smoke namespace.
  run(['eval', "Object.keys(localStorage).filter((key) => key.startsWith('sb-')).forEach((key) => localStorage.removeItem(key)); 'signed out'"], { quiet: true })
  console.log('Admin smoke test passed.')
} finally {
  try { run(['close'], { quiet: true }) } catch { /* already closed */ }
}
