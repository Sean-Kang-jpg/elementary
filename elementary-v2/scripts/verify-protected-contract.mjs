// No browser, network, disk writes or real user storage: execute existing helpers
// with in-memory localStorage. Transpile TypeScript without creating build files.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/protected_contract_20261006.json'), 'utf8'))
const records = new Map()
const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, String(value)), removeItem: key => records.delete(key) }
const window = { localStorage: storage, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} }
const load = (relative, imports = {}) => {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const context = { exports, module: { exports }, localStorage: storage, window, Event: class { constructor(type) { this.type = type } }, URL, URLSearchParams, require(name) { if (!(name in imports)) throw new Error(`Unexpected import: ${name}`); return imports[name] } }
  vm.runInNewContext(compiled, context, { filename: relative, timeout: 2000 })
  return context.module.exports
}
const plain = value => JSON.parse(JSON.stringify(value))
let passed = 0
const check = (name, action) => { action(); passed += 1; console.log(`PASS: ${name}`) }
const registry = load('src/constants/regionRegistry.ts')
const routes = load('src/utils/urlState.ts', { '../constants/regionRegistry': registry })
for (const test of fixture.routes) check(`route ${test.path}${test.search || ''}`, () => assert.deepEqual(plain(routes.parseRoute(test.path, test.search || '')), test.expected))
check('guide addresses remain readable', () => {
  for (const slug of fixture.guide_slugs) {
    assert.equal(routes.guidePath(slug), `/guide/${slug}`)
    assert.ok(fs.existsSync(path.join(root, 'src/content/guides', `${slug}.md`)), `Protected guide removed: ${slug}`)
  }
})
check('school URL retains stable school_id', () => assert.equal(routes.schoolPath({ school_id: 'B000002292', school_name: '서울대현초등학교', region: '서울특별시', district: '강남구' }), '/school/서울-강남구-서울대현초등학교--B000002292'))
check('apartment URL uses public key, not internal id', () => {
  assert.equal(routes.apartmentPath({ id: 'internal-fixture', public_key: '7A2EMR5J', city: '서울특별시', district: '강남구', name: '은마' }), '/apt/서울-강남구-은마--7A2EMR5J')
  assert.equal(routes.apartmentPath({ id: 'internal-fixture' }), null)
})
check('retired experimental routes fall back to home', () => {
  for (const value of ['/plans', '/ranking', '/grade1', '/items/name--7A2EMR5J']) assert.equal(routes.parseRoute(value).kind, 'home')
})
const profile = load('src/utils/profile.ts')
check('profile v1 roundtrip', () => { profile.saveProfile(fixture.storage.profile); assert.deepEqual(plain(profile.readProfile()), fixture.storage.profile); assert.ok(records.has(fixture.storage.profile_key)) })
check('all checklist ids retain completed state', () => {
  const state = Object.fromEntries(fixture.checklist_ids.map(id => [id, true]))
  profile.saveChecklist(state)
  assert.deepEqual(plain(profile.readChecklist()), state)
  const live = JSON.parse(fs.readFileSync(path.join(root, 'src/content/checklist.json'), 'utf8')).groups.flatMap(group => group.items.map(item => item.id))
  for (const id of fixture.checklist_ids) assert.ok(live.includes(id), `Protected checklist id removed: ${id}`)
})
check('read guides remain deduplicated', () => { profile.markGuideRead('school-notice'); profile.markGuideRead('school-notice'); assert.deepEqual(plain(profile.readGuides()), ['school-notice']); assert.ok(records.has(fixture.storage.read_guides_key)) })
check('invalid profile safely falls back', () => { storage.setItem(fixture.storage.profile_key, '{invalid'); assert.deepEqual(plain(profile.readProfile()), plain(profile.EMPTY_PROFILE)) })
const favorites = load('src/utils/favorites.ts')
check('school/apartment favorites and public key survive read', () => { storage.setItem(fixture.storage.favorites_key, JSON.stringify(fixture.storage.favorites)); assert.deepEqual(plain(favorites.readFavorites()), fixture.storage.favorites) })
check('legacy school IDs import without duplicates', () => {
  storage.setItem(fixture.storage.legacy_school_ids_key, JSON.stringify(['B000002292', 'B000000001']))
  const saved = plain(favorites.readFavorites())
  assert.equal(saved.filter(item => item.kind === 'school' && item.id === 'B000002292').length, 1)
  assert.ok(saved.some(item => item.id === 'B000000001'))
  assert.equal(storage.getItem(fixture.storage.legacy_school_ids_key), null)
  assert.ok(saved.some(item => item.publicKey === '7A2EMR5J'))
})
check('legacy apartment without publicKey remains readable', () => {
  const legacy = { ...fixture.storage.favorites[1] }
  delete legacy.publicKey
  storage.setItem(fixture.storage.favorites_key, JSON.stringify([legacy]))
  assert.deepEqual(plain(favorites.readFavorites()), [legacy])
})
const deploy = JSON.parse(fs.readFileSync(path.join(root, '..', 'vercel.json'), 'utf8'))
check('production rewrites protect school/apartment crawler routes', () => {
  assert.ok(deploy.rewrites.some(item => item.source === '/school/(.*)' && item.destination.startsWith('/api/detail?type=school')))
  assert.ok(deploy.rewrites.some(item => item.source === '/apt/(.*)' && item.destination.startsWith('/api/detail?type=apt')))
})
console.log(`Protected contract: ${passed} checks passed. In-memory storage only.`)
