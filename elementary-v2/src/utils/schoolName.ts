// 서울 공립초는 공식 이름이 모두 '서울'로 시작한다(서울대현초등학교). 2026-10-09
// 실측으로 566곳 전부라 목록에서 지역명만 거듭 읽히므로 화면에서는 뗀다.
//
// 화면 표기만 바꾼다. 공개 주소의 읽는 부분, 문서 제목, 공유 문구, 검색은 공식
// 이름을 그대로 쓴다 — 주소를 바꾸면 크롤러용 사전 렌더(api/detail.js)·사이트맵과
// 철자가 어긋난다.
//
// 국립 부설초(서울교육대학교부설, 서울대학교사범대학부설)와 사립(서울삼육)은
// '서울'이 고유한 이름의 일부이므로 둔다. 설립 구분을 모르는 자리(아파트의 배정
// 학교 이름)는 부설초만 이름으로 거른다. 사립은 학구가 없어 배정 학교로 나오지 않는다.
export function displaySchoolName(name: string, establishmentType?: string | null): string {
  if (establishmentType && establishmentType !== '공립') return name
  const match = /^서울(.{2,}초등학교)$/.exec(name)
  if (!match || match[1].includes('대학교')) return name
  return match[1]
}
