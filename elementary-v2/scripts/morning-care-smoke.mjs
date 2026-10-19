import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Pass a local URL; mock data is local QA only.')
const output = path.join(root, 'docs/research/track-b-morning-care')
fs.mkdirSync(output, { recursive: true })
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const prefix = ['--namespace', 'elementary-morning', '--session', `morning-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = code => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`(() => { try { return Boolean(${condition}) } catch { return false } })()`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const check = (condition, label) => {
  evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return true })()`)
  process.stdout.write(`PASS: ${label}\n`)
}
const clickText = text => evaluate(`[...document.querySelectorAll('.my-schedule button')].find(b=>b.textContent===${JSON.stringify(text)}).click(); true`)
const stored = "JSON.parse(localStorage.getItem('elementary-schedule-plans-v1')).plans.find(p=>p.schoolId==='qa-morning')"
const morning = `${stored}.entries.find(e=>e.id==='care-qa-morning-morning')`
const openSelection = () => evaluate("document.querySelector('.my-program-selection').open=true; true")
const openSchoolCare = async () => {
  await wait("document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'school detail opens')
  evaluate("[...document.querySelectorAll('[aria-label=\"학교 상세 메뉴\"] button')].find(b=>b.textContent==='방과후·돌봄').click(); true")
  await wait("document.querySelector('[data-testid=school-morning-care][aria-busy=false]')", 'morning school panel finishes loading')
}
try {
  run('open', new URL('/timetable', base).href, '--init-script', path.join(root, 'scripts/fixtures/morning-care-network.js'))
  run('set', 'viewport', '390', '844')
  await wait("document.querySelector('#timetable-title')", 'timetable opens')
  evaluate("localStorage.removeItem('elementary-schedule-plans-v1'); sessionStorage.removeItem('qa-morning-state'); localStorage.setItem('elementary-favorites-v1',JSON.stringify([{kind:'school',id:'qa-morning',name:'QA 아침돌봄 검사용 학교',address:'모의 정보',latitude:0,longitude:0}])); location.reload(); true")
  await wait("new URLSearchParams(location.search).get('school')==='qa-morning' && document.querySelector('.my-schedule')", 'isolated QA school selected')
  clickText('시간표 초안 만들기')
  await wait("document.querySelector('[data-testid=morning-care-choice]')", 'legacy morning hours become an explicit choice')
  clickText('주간 편집')
  openSelection()
  check(`${stored}.entries.length===0`, 'no care is automatically enrolled or selected')
  check("document.querySelector('[data-testid=morning-care-choice]').textContent.includes('대상 미확인') && document.querySelector('[data-testid=morning-care-choice] button').disabled", 'morning grades are not copied from afternoon and weekdays are required')
  evaluate("document.querySelectorAll('[data-testid=morning-care-choice] input')[0].click();document.querySelectorAll('[data-testid=morning-care-choice] input')[2].click();true")
  clickText('아침돌봄 시간표에 넣기')
  await wait(`${morning}?.weekdays.join(',')==='1,3'`, 'only explicitly chosen weekdays are saved')
  check(`${morning}.kind==='care' && ${morning}.start===450 && ${morning}.end===520 && ${morning}.participation==='planned' && ${morning}.transitionIn==='unknown'`, 'existing storage format preserves source times without confirming enrollment or transfer')
  check("[1,3].every(d=>document.querySelector('#my-week-day-'+d+' [data-band=morning]')?.textContent.includes('07:30–08:40')) && !document.querySelector('#my-week-day-2 [data-band=morning]') && !document.querySelector('.my-week-section').textContent.includes('시간 겹침')", 'morning care is integrated into exactly the selected weekday columns without invented collisions')
  run('reload')
  await wait("document.querySelector('.my-week-section')", 'saved timetable reopens')
  clickText('주간 편집')
  await wait("document.querySelector('[data-testid=morning-care-week]')", 'morning selection survives reload')
  openSelection()
  check("document.querySelectorAll('[data-testid=morning-care-choice] input:checked').length===2", 'saved weekdays return on reload')
  run('scrollintoview', '[data-testid=morning-care-week]')
  run('screenshot', path.join(output, 'my-mobile.png'))
  clickText('아침돌봄 선택 해제')
  await wait(`!${morning} && !document.querySelector('[data-testid=morning-care-week]')`, 'deselecting removes only the morning plan')
  evaluate("sessionStorage.setItem('qa-morning-state','unknown');location.reload();true")
  await wait("document.querySelector('[data-testid=morning-care-choice]')", 'unknown morning data renders')
  openSelection()
  check("document.querySelector('[data-testid=morning-care-choice]').textContent.includes('미확인은 미운영을 뜻하지') && !document.querySelector('[data-testid=morning-care-choice] button')", 'unknown data does not offer an invented schedule')
  evaluate("sessionStorage.setItem('qa-morning-state','reported');true")
  run('open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', base).href)
  await openSchoolCare()
  check("document.querySelector('[data-testid=school-morning-care]').textContent.includes('운영시간 기재') && document.querySelector('[data-testid=school-morning-care]').textContent.includes('2025학년도') && document.querySelector('[data-testid=school-morning-care]').textContent.includes('QA 모의 운영계획')", 'school panel retains source and historical school year')
  check("document.querySelector('[data-testid=school-morning-care]').textContent.includes('등교시각미확인') && document.querySelector('[data-testid=school-morning-care]').textContent.includes('아침돌봄 대상 미확인')", 'arrival time and morning eligibility remain unknown')
  run('scrollintoview', '[data-testid=school-morning-care]')
  run('screenshot', path.join(output, 'school-mobile.png'))
  check("document.documentElement.scrollWidth<=innerWidth", 'mobile document has no horizontal overflow')
  await wait("document.querySelector('[data-testid=center-morning-care]')", 'nearby centers show morning and escort fields')
  check("document.querySelector('[data-testid=center-morning-care]').textContent.includes('아침돌봄 · 미확인') && document.querySelector('[data-testid=center-morning-care]').textContent.includes('등교 동행 · 미확인') && window.qaMorningRadius.every(r=>r===1000) && window.qaMorningRadius.length>0", 'early center opening does not imply morning care or escort; radius stays 1km')
  evaluate("[...document.querySelectorAll('[data-testid=care-centers] button')].find(b=>b.textContent==='상세 안내').click();true")
  await wait("document.querySelector('[data-testid=map-place-detail] [data-testid=center-morning-care]')", 'map detail reuses the center morning component')
  check("document.querySelector('[data-testid=map-place-detail]').textContent.includes('동행 대상 학교·학년·요일·인계 장소·추가 비용')", 'escort conditions stay visible for direct confirmation')
  run('screenshot', path.join(output, 'center-mobile.png'))
  evaluate("sessionStorage.setItem('qa-morning-state','missing');true")
  run('open', new URL('/school/서울-강남구-서울대현초등학교--B000002292', base).href)
  await openSchoolCare()
  check("document.querySelector('[data-testid=school-morning-care]').textContent.includes('기준 학년도: 미확인') && !document.querySelector('[data-testid=school-morning-care]').textContent.includes('미운영 확인')", 'missing row remains unknown with no invented year')
  evaluate("sessionStorage.setItem('qa-morning-state','error');location.reload();true")
  await openSchoolCare()
  check("document.querySelector('[data-testid=school-morning-care]').textContent.includes('자료를 불러오지 못했어요')", 'network failure is distinct from no data')
  evaluate("sessionStorage.setItem('qa-morning-state','reported');location.reload();true")
  await openSchoolCare()
  run('set', 'viewport', '1280', '900')
  run('scrollintoview', '[data-testid=school-morning-care]')
  run('screenshot', path.join(output, 'school-desktop.png'))
  process.stdout.write(`Screenshots: ${output}\n`)
} finally { try { run('close') } catch { /* preserve first failure */ } }
