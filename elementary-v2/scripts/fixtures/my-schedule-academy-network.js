// Extra local-only public RPC fixture; never included in application bundles.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const originalFetch = window.fetch.bind(window)
  window.qaAcademyReads = 0
  window.fetch = async (...args) => {
    const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url)
    if (url.pathname.endsWith('/rpc/nearby_academy_addresses_for_school')) {
      const body = typeof args[1]?.body === 'string' ? JSON.parse(args[1].body) : null
      if (body?.p_school_id === 'qa-schedule') {
        window.qaAcademyReads += 1
        if (window.qaAcademyFail) return new Response(JSON.stringify({ message: 'QA read failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        return new Response(JSON.stringify([
          { address_id: 'qa-one', district: 'QA', latitude: 37, longitude: 127, institution_count: 2, straight_distance_m: 120, distance_band: 'core', institutions: [
            { name: 'QA 수학학원', type: '학원', realm: '입시.검정 및 보습', subjects: ['math'] },
            { name: 'QA 영어학원', type: '학원', realm: '입시.검정 및 보습', subjects: ['english'] },
          ] },
          { address_id: 'qa-two', district: 'QA', latitude: 37, longitude: 127, institution_count: 1, straight_distance_m: 350, distance_band: 'extended', institutions: [
            { name: 'QA 피아노교습소', type: '교습소', realm: '예능', subjects: ['arts'] },
          ] },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }
    return originalFetch(...args)
  }
}
