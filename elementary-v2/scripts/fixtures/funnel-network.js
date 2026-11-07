// Local-only, isolated browser QA. Synthetic schools are never written to the backend.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  localStorage.setItem('wherecho:analytics-debug', '1')
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const request = args[0]
    const url = new URL(typeof request === 'string' ? request : request.url)
    const id = url.searchParams.get('school_id')?.replace(/^eq\./, '')
    if (!['B900000001', 'B900000002'].includes(id)) return originalFetch(...args)
    const table = url.pathname.split('/').at(-1)
    let row = null
    if (table === 'school_master') row = { school_id: id, school_name: `QA ${id}`, region: '서울특별시', road_address: 'QA', establishment_type: '공립' }
    else if (table === 'school_day_estimates') row = {
      school_id: id, source_year: 2026, applies_to_entry_year: 2027, lunch_position: 'after_4', clock_source: 'QA', periods_source: 'QA',
      school_day_estimate_weekdays: [1, 2, 3, 4, 5].map(weekday => ({ weekday, periods: 4, dismissal: '13:00:00' })),
    }
    const many = table === 'school_afterschool_programs' || table === 'school_care_statistics'
    return new Response(JSON.stringify(many ? [] : row), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
