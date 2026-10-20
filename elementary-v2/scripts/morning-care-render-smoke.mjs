// Complements browser QA; this does not claim browser layout/interaction coverage.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// In-process TSX conversion avoids browser and dev-server dependencies for this check.
const require = createRequire(import.meta.url)
const modules = new Map()
const moduleUrl = file => {
  if (modules.has(file)) return modules.get(file)
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const code = compiled.replace(/from (['"])([^'"]+)\1/g, (_, quote, specifier) => {
    if (!specifier.startsWith('.')) return `from ${quote}${pathToFileURL(require.resolve(specifier)).href}${quote}`
    const target = path.resolve(path.dirname(file), specifier)
    const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${file}`)
    return `from ${quote}${moduleUrl(resolved)}${quote}`
  })
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  modules.set(file, url)
  return url
}
const load = relative => import(moduleUrl(path.resolve(relative)))
{
  const { default: Panel } = await load('src/components/care/MorningCarePanel.tsx')
  const { default: Center } = await load('src/components/care/CareCenterMorningInfo.tsx')
  const { default: Choice } = await load('src/components/navigation/MorningCareScheduleChoice.tsx')
  const { unknownMorningCare, morningCareFromLegacy } = await load('src/utils/morningCare.ts')
  const { morningCareEntry } = await load('src/utils/schedule/morningCare.ts')
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))
  const unknown = render(Panel, {})
  for (const field of ['등교시각', '아침돌봄', '시작·종료', '대상학년', '신청 정보', '출처', '기준 학년도']) assert.ok(unknown.includes(field), field)
  assert.ok(unknown.includes('미확인은 미운영을 뜻하지'))
  assert.ok(!unknown.includes('미운영 확인'))
  assert.ok(render(Panel, { state: 'error' }).includes('자료를 불러오지 못했어요'))
  assert.ok(render(Panel, { state: 'loading' }).includes('aria-busy="true"'))
  const info = {
    ...unknownMorningCare(), status: 'operating', arrivalTime: '08:50', startTime: '07:30', endTime: '08:40',
    grades: '1~2학년', schoolYear: 2026, source: 'QA 모의 원문', sourceUrl: 'https://example.com/source',
    application: 'QA 신청 기간·방법', applicationUrl: 'https://example.com/apply', checkedOn: '2026-10-15',
  }
  const known = render(Panel, { info })
  for (const field of ['운영 확인', '08:50', '07:30', '08:40', '1~2학년', '2026학년도', 'QA 모의 원문', 'QA 신청 기간·방법', '2026-10-15', 'https://example.com/apply']) assert.ok(known.includes(field), field)
  assert.ok(render(Panel, { info: { ...info, status: 'not_operating' } }).includes('미운영 확인'))
  assert.ok(!render(Panel, { info: { ...info, applicationUrl: 'javascript:alert(1)' } }).includes('javascript:'))
  console.log('PASS: school panel renders every field, explicit states, provenance, loading/error and safe links')
  const center = render(Center, {})
  for (const field of ['아침돌봄 · 미확인', '등교 동행 · 미확인', '동행 대상 학교·학년·요일·인계 장소·추가 비용', '운영시간만으로']) assert.ok(center.includes(field), field)
  assert.ok(render(Center, { escort: { status: 'unavailable', conditions: 'QA 인계 조건', source: 'QA 센터 원문', schoolYear: 2026 } }).includes('미제공 확인'))
  console.log('PASS: center keeps morning operation, escort and conditions independent')
  const legacy = morningCareFromLegacy({ school_id: 'qa-render', source_year: 2025, status: 'stated', morning_hours: '07:30-08:40', grades: '1~2', source: 'QA 이전 학년도' })
  const choice = render(Choice, { schoolId: 'qa-render', info: legacy, entries: [], onAdd: () => true, onRemove: () => true })
  assert.ok(choice.includes('대상 미확인'))
  assert.equal((choice.match(/type="checkbox"/g) ?? []).length, 5)
  assert.ok(choice.includes('disabled=""'))
  const entry = morningCareEntry('qa-render', legacy, [1, 3])
  const saved = render(Choice, { schoolId: 'qa-render', info: legacy, entries: [entry], onAdd: () => true, onRemove: () => true })
  assert.equal((saved.match(/checked=""/g) ?? []).length, 2)
  assert.ok(saved.includes('아침돌봄 요일 반영'))
  assert.ok(saved.includes('아침돌봄 선택 해제'))
  assert.equal(entry.participation, 'planned')
  const cancelled = render(Choice, { schoolId: 'qa-render', info: legacy, entries: [{ ...entry, participation: 'cancelled' }], onAdd: () => true, onRemove: () => true })
  assert.ok(cancelled.includes('아침돌봄 시간표에 넣기'))
  console.log('PASS: schedule requires weekday selection and restores saved weekdays without confirming participation')
}
