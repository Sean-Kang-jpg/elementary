// Synthetic read-only responses for the isolated TT-01 browser smoke.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  localStorage.setItem('wherecho:analytics-debug', '1')
  window.qaSchoolRequests = []
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const request = args[0]
    const url = new URL(typeof request === 'string' ? request : request.url, location.href)
    if (!url.pathname.startsWith('/rest/v1/')) return originalFetch(...args)
    const id = url.searchParams.get('school_id')?.replace(/^eq\./, '')
    const table = url.pathname.split('/').at(-1)
    window.qaSchoolRequests.push(table)
    const knownSchool = /^B90000000[1-5]$/.test(id)
    const oneRow = ['school_master', 'school_day_estimates', 'school_care_hours', 'school_afterschool_summary'].includes(table)
    let row = oneRow ? null : []
    if (knownSchool && table === 'school_master') {
      row = { school_id: id, school_name: `QA ${id}`, region: '서울특별시', road_address: 'QA', establishment_type: '공립' }
    }
    if (table === 'school_day_estimates') {
      if (id === 'B900000003') return Response.json({ code: 'QA_FAILURE', message: 'Fixture request failed' }, { status: 503 })
      if (id === 'B900000005') {
        window.qaDelayedDay ??= new Promise((resolve) => { window.qaReleaseDay = resolve })
        await window.qaDelayedDay
        window.qaDayDelivered = true
      }
      if (id === 'B900000002' || id === 'B900000004' || id === 'B900000005') {
        row = {
          school_id: id, source_year: 2026, applies_to_entry_year: 2027, lunch_position: 'after_4',
          school_day_estimate_weekdays: (id === 'B900000004' ? [1] : [1, 2, 3, 4, 5]).map(weekday => ({ weekday, periods: 4, dismissal: '13:00:00' })),
        }
      }
    }
    if (table === 'school_afterschool_summary') {
      if (id === 'B900000002') {
        window.qaDelayedCourses ??= new Promise((resolve) => { window.qaReleaseCourses = resolve })
        await window.qaDelayedCourses
        window.qaCoursesDelivered = true
      }
      if (id === 'B900000003' && !window.qaCoursesRecovered) {
        return Response.json({ code: 'QA_FAILURE', message: 'Fixture request failed' }, { status: 503 })
      }
      if (id === 'B900000004') row = { school_id: id, source_year: 2026, tier: 'A', term_label: '1학기' }
    }
    if (table === 'school_afterschool_programs' && id === 'B900000004') {
      row = [{ seq: 1, kind: '방과후', name: 'QA 미술', category: '미술', grade1: 'true', grade_upper: 2,
        weekdays: '월', start_time: '14:00:00', end_time: '14:40:00' }]
    }
    if (table === 'school_afterschool_slots' && id === 'B900000004') {
      row = [{ weekday: 1, kind: '저학년방과후', start_time: '14:00:00', end_time: '14:40:00' }]
    }
    return Response.json(row)
  }
}
