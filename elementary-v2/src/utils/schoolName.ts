// 일부 광역시의 공립초는 공식 이름 앞에 도시 이름이 붙는다(서울대현초등학교). 목록에서
// 지역명만 거듭 읽히므로 화면에서는 뗀다. 2026-10-09 실측(공립 중 접두 붙은 곳):
// 서울 566/566, 인천 242/269, 대구 227/231, 대전 123/153, 광주 40/151.
// 울산(5)·부산(1)·제주(5)·세종(1)은 접두가 고유한 이름의 일부라 넣지 않는다
// (울산초, 부산진초, 제주북초).
//
// 화면 표기만 바꾼다. 데이터·ETL은 공식 이름 그대로이고, 공개 주소의 읽는 부분,
// 문서 제목, 공유 문구, 검색도 공식 이름을 쓴다 — 주소를 바꾸면 크롤러용 사전
// 렌더(api/detail.js)·사이트맵과 철자가 어긋난다. ETL이 학교를 새로 들여와도 규칙이
// 이름 모양으로 정해지므로 손댈 것이 없다. 아래 예외만 새 학교와 겹치는지 본다.
//
// 떼지 않는 경우:
// - 그 시·도의 학교가 아니다. 경기 광주시의 광주도평초는 시 이름이 이름이다.
//   시·도를 모르는 자리(저장 목록의 옛 기록)는 그대로 둔다.
// - 국립 부설초·사립. 설립 구분을 모르는 자리(아파트의 배정 학교)는 부설초만
//   이름으로 거른다. 사립은 학구가 없어 배정 학교로 나오지 않는다.
// - 남는 이름이 한 글자다(광주서초 → '서초등학교'). 정규식의 .{2,}가 거른다.
// - 떼면 같은 시·도의 다른 학교와 이름이 같아진다.
const CITY_PREFIXES = ['서울', '인천', '대구', '대전', '광주']
const KEEP_PREFIX = new Set(['인천삼산초등학교']) // 인천 삼산초등학교가 따로 있다

// place는 시·도(서울특별시)나 그것으로 시작하는 주소다.
export function displaySchoolName(name: string, place?: string | null, establishmentType?: string | null): string {
  if (establishmentType && establishmentType !== '공립') return name
  const prefix = CITY_PREFIXES.find((city) => name.startsWith(city))
  if (!prefix || !place?.trim().startsWith(prefix) || KEEP_PREFIX.has(name)) return name
  const rest = name.slice(prefix.length)
  if (!/^.{2,}초등학교/.test(rest) || rest.includes('대학교')) return name
  return rest
}
