// Browser QA only. No application import, DB write, or production fixture path.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const originalFetch = window.fetch.bind(window)
  const reply = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  window.qaMorningRadius = []
  window.fetch = async (...args) => {
    const request = args[0]
    const url = new URL(typeof request === 'string' ? request : request.url)
    const table = url.pathname.split('/').at(-1)
    const id = url.searchParams.get('school_id')
    if (table === 'nearby_care_centers') {
      window.qaMorningRadius.push(JSON.parse(args[1]?.body ?? '{}').p_max_distance_m)
      return reply([{ center_id: 'qa-morning-center', center_kind: '다함께돌봄센터', name: 'QA 아침 확인 센터', address: '화면 검증용 모의 정보', address_detail: null, phone: null, capacity: 20, term_hours: '07:00~19:00', vacation_hours: '07:00~19:00', latitude: 37.5, longitude: 127.05, source_updated_on: '2026-10-15', straight_distance_m: 300 }])
    }
    if (!['eq.qa-morning', 'eq.B000002292'].includes(id)) return originalFetch(...args)
    if (table === 'school_care_hours') {
      const state = sessionStorage.getItem('qa-morning-state') ?? 'reported'
      if (state === 'error') throw new TypeError('Local QA morning care failure')
      if (state === 'missing') return reply(null)
      return reply({ school_id: id.slice(3), source_year: 2025, status: 'stated', afternoon_end: '17:00:00', extended_end: '19:00:00', extended_condition: '별도 신청', morning_hours: state === 'unknown' ? null : '07:30-08:40', grades: '1~2', source: 'QA 모의 운영계획' })
    }
    if (id === 'eq.qa-morning') {
      if (table === 'school_day_estimates' || table === 'school_afterschool_summary') return reply(null)
      if (table === 'school_afterschool_programs') return reply([])
    }
    return originalFetch(...args)
  }
}
