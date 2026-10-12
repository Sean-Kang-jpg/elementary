// Real public school/apartment reads in an isolated automation browser.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/agent-browser/bin/agent-browser.js')
const base = process.argv[2] || 'http://localhost:3001'
const prefix = ['--namespace', 'elementary-apartment-header', '--session', `header-${process.pid}`]
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...prefix, ...args], { cwd: root, encoding: 'utf8', timeout: 45000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}
const evaluate = (code) => run('eval', code)
const wait = async (condition, label) => {
  const until = Date.now() + 20000
  while (!evaluate(`Boolean(${condition})`).includes('true')) {
    if (Date.now() >= until) throw new Error(label)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  process.stdout.write(`PASS: ${label}\n`)
}
const layout = `(() => {
  const header = document.querySelector('[data-testid=apartment-list-header]');
  const title = header?.querySelector('h3'); const count = title?.querySelector('span');
  const sort = header?.querySelector('select'); if (!title || !count || !sort) return false;
  const t=title.getBoundingClientRect(), c=count.getBoundingClientRect(), s=sort.getBoundingClientRect();
  return header.getBoundingClientRect().height < 75 && Math.abs((t.top+t.bottom-s.top-s.bottom)/2) < 2
    && t.right <= s.left && s.right <= innerWidth && c.right <= t.right
    && document.documentElement.scrollWidth <= innerWidth && count.textContent === document.querySelectorAll('.apartment-card').length + '개 단지';
})()`
try {
  for (const school of ['서울-중구-서울흥인초등학교--B000002102', '서울-강남구-서울대현초등학교--B000002292']) {
    run('set', 'viewport', '390', '844')
    run('open', new URL(`/school/${school}`, base).href)
    await wait("document.querySelector('[aria-label=\"학교 상세 메뉴\"]')", 'school detail opens')
    evaluate("[...document.querySelectorAll('[aria-label=\"학교 상세 메뉴\"] button')].find(b=>b.textContent==='배정·통학').click(); true")
    await wait("document.querySelector('[data-testid=apartment-list-header]')", 'assigned apartment header loads')
    for (const width of [360, 390, 430, 1280]) {
      run('set', 'viewport', String(width), '844')
      await wait(layout, `${school}: title, adjacent count and right sort occupy one row at ${width}px`)
    }
    if (school.includes('B000002292')) {
      await wait("document.querySelectorAll('.apartment-card').length > 1", 'real sample contains multiple apartments for sorting')
      for (const field of ['households', 'name', 'parking', 'year']) {
        for (const order of ['asc', 'desc']) {
          run('select', 'select[aria-label="단지 정렬"]', `${field}:${order}`)
          await wait(`(() => {
            const cards=[...document.querySelectorAll('.apartment-card')];
            const values=cards.map(card=>{
              const info=card.querySelector('b').parentElement.textContent;
              return ${JSON.stringify(field)}==='name' ? card.querySelector('strong').textContent
                : ${JSON.stringify(field)}==='households' ? Number(card.querySelector('b').textContent.replace(/[^0-9]/g,''))
                : ${JSON.stringify(field)}==='year' ? Number((info.match(/(\\d{4})년/)||[])[1]||0)
                : parseFloat([...card.querySelectorAll('strong')].at(-1).textContent);
            });
            return values.every((value,index)=>!index || (typeof value==='string'
              ? values[index-1].localeCompare(value,'ko') : values[index-1]-value) * ${order==='asc' ? 1 : -1} <= 0);
          })()`, `${field} ${order} sorts actual cards`)
        }
      }
      run('select', 'select[aria-label="단지 정렬"]', 'households:desc')
      evaluate("document.querySelector('.apartment-card').click(); true")
      await wait("document.querySelector('#assigned-school-title') && location.pathname.startsWith('/apt/')", 'sorted apartment still opens its canonical detail')
    } else if (process.argv[3]) {
      run('set', 'viewport', '390', '844')
      evaluate("document.querySelector('[data-testid=apartment-list-header]').scrollIntoView({block:'start'}); true")
      run('screenshot', process.argv[3])
    }
  }
} finally { try { run('close') } catch { /* preserve first failure */ } }
