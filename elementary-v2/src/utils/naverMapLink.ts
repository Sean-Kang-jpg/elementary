/**
 * 기관을 네이버 지도에서 찾아보는 바깥 링크(ACADEMY_SIGNALS_PLAN 5절, 2026-11-22 사용자 결정).
 *
 * 네이버 지도의 차량 운행·영업시간은 업체가 직접 올린 정보라 수집하지 않는다(10-31 결정). 대신 부모가 그 화면을
 * 바로 열 수 있게 검색 링크만 만든다. 공개자료 이름과 네이버 등록 이름이 다른 곳이 많아 정확한 장소 링크는 만들 수
 * 없다 — '시·군·구 + 이름'으로 검색해 근처 결과에서 고르게 한다. 공개 주소는 시·군·구까지만 있다(도로명은 비공개).
 */

/** 공개자료 이름에서 네이버 검색을 방해하는 꼬리를 뗀다: 괄호 안 설명, 법인 표기. */
export const naverSearchName = (name: string): string =>
  name
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const naverMapSearchUrl = (name: string, district?: string): string => {
  const cleaned = naverSearchName(name) || name.trim()
  const query = [district?.trim(), cleaned].filter(Boolean).join(' ')
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`
}

export const NAVER_TITLE = '네이버 지도에서 이름으로 검색해요. 등록 이름이 달라 바로 안 나오면 근처 결과에서 골라 보세요. 차량 운행·시간은 업체가 올린 정보예요.'
