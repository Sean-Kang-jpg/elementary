// Browser init script for local-only QA. Never imported by the app/build.
// Intercept before the data client captures fetch; no DB writes or fake live rows.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const originalFetch = window.fetch.bind(window)
  window.qaCareMode = 'rows'
  window.fetch = async (...args) => {
    if (!String(args[0]).includes('/rest/v1/rpc/nearby_care_centers')) return originalFetch(...args)
    window.qaCareRequest = JSON.parse(args[1]?.body || '{}')
    if (window.qaCareMode === 'error') throw new TypeError('Local QA simulated care request failure')
    const rows = window.qaCareMode === 'empty' ? [] : [{
      center_id: 'qa-layer-zero', center_kind: '우리동네키움센터', name: 'QA 표시 검사용 센터 (운영 자료 아님)',
      address: 'QA 표본 주소', address_detail: null, phone: null, capacity: 0, term_hours: null, vacation_hours: null,
      latitude: window.qaCareRequest.p_latitude - 0.0007, longitude: window.qaCareRequest.p_longitude + 0.0012,
      source_updated_on: null, straight_distance_m: 150,
    }]
    window.qaCareResponse = { status: 200, rows: rows.length }
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
