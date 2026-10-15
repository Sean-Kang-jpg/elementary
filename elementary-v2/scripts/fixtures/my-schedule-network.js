// Local browser QA only; never imported by the application. Real schools use real reads.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const originalFetch = window.fetch.bind(window)
  window.qaScheduleFail = sessionStorage.getItem('qa-schedule-fail') === 'true'
  window.qaScheduleReads = []
  window.fetch = async (...args) => {
    const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url)
    const table = url.pathname.split('/').at(-1)
    const tables = ['school_afterschool_summary', 'school_afterschool_programs', 'school_day_estimates', 'school_care_hours']
    if (!tables.includes(table)) return originalFetch(...args)
    if (url.searchParams.get('school_id') !== 'eq.qa-schedule') {
      const response = await originalFetch(...args)
      window.qaScheduleReads.push({ table, status: response.status, data: await response.clone().json() })
      return response
    }
    if (window.qaScheduleFail && table.startsWith('school_afterschool')) throw new TypeError('Local QA simulated network failure')
    const rows = {
      school_afterschool_summary: { school_id: 'qa-schedule', source_year: 2026, tier: 'A', term_label: '1학기' },
      school_afterschool_programs: [
        { seq: 1, kind: '방과후', name: 'QA 미술', variant: null, section: 'A', category: '예술', grade1: 'true', grade_upper: 2, weekdays: '월수', start_time: '14:00:00', end_time: '15:00:00' },
        { seq: 2, kind: '방과후', name: 'QA 미술', variant: null, section: 'B', category: '예술', grade1: 'unknown', grade_upper: null, weekdays: '금', start_time: '15:00:00', end_time: '16:00:00' },
        { seq: 3, kind: '맞춤형', name: 'QA 놀이', variant: null, section: null, category: '놀이', grade1: 'true', grade_upper: 1, weekdays: '월', start_time: '14:30:00', end_time: '15:30:00' },
        { seq: 4, kind: '방과후', name: 'QA 요일미확인', variant: null, section: null, category: 'STEM', grade1: 'unknown', grade_upper: null, weekdays: null, start_time: '15:00:00', end_time: '16:00:00' },
        { seq: 5, kind: '방과후', name: 'QA 시간미확인', variant: null, section: null, category: 'STEM', grade1: 'true', grade_upper: 2, weekdays: '목', start_time: null, end_time: null },
      ],
      school_day_estimates: { school_id: 'qa-schedule', source_year: 2026, applies_to_entry_year: 2027, lunch_position: 'after_4', lunch_start: null, lunch_end: null, clock_source: 'QA', periods_source: 'QA', reviewed_on: '2026-10-14', school_day_estimate_weekdays: [1,2,3,4,5].map(weekday => ({ weekday, periods: 4, dismissal: '13:00:00', note: null })) },
      school_care_hours: { school_id: 'qa-schedule', source_year: 2026, status: 'stated', afternoon_end: '17:00:00', extended_end: '19:00:00', extended_condition: '별도 신청', morning_hours: null, grades: '1~2학년', source: 'QA' },
    }
    return new Response(JSON.stringify(rows[table]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
