/**
 * 서버가 그려 보낸 지역 허브를 React가 #root를 비우기 전에 받아 둔다.
 *
 * 허브(`/area/…`)는 api/detail.js가 만든 HTML이 곧 화면이다. 처음 열린 주소가
 * 허브라면 내용이 이미 문서에 있으므로, 다시 받아 오지 않고 이것을 쓴다 — 그러지
 * 않으면 내용이 한 번 사라졌다가 다시 나타난다. 앱 안에서 다른 허브로 옮겨 가면
 * AreaPage가 그 주소의 HTML을 새로 받아 온다.
 */

interface PrerenderedArea {
  path: string
  html: string
  title: string
}

let captured: PrerenderedArea | null = null

/** 주소 비교용. 브라우저의 pathname은 퍼센트 인코딩돼 있고 앱이 만든 주소는 한글 그대로다. */
export const decodedPath = (path: string): string => {
  try {
    return decodeURI(path).replace(/\/+$/, '') || '/'
  } catch {
    return path
  }
}

/** main.tsx가 createRoot 전에 한 번 부른다. */
export const capturePrerendered = (): void => {
  const area = document.querySelector('#root [data-area-page]')
  if (!area) return
  captured = { path: decodedPath(window.location.pathname), html: area.outerHTML, title: document.title }
}

/**
 * 처음 열린 주소의 허브라면 그 내용을, 아니면 null. 꺼내도 지우지 않는다 —
 * StrictMode는 초기값 함수를 두 번 부르고, 뒤로 가기로 돌아와도 같은 내용이다.
 */
export const takePrerendered = (path: string): PrerenderedArea | null =>
  captured && captured.path === decodedPath(path) ? captured : null

/** 받아 온 문서에서 허브 내용과 제목을 꺼낸다. 허브가 아니면(개발 서버의 셸 등) null. */
export const extractArea = (path: string, documentText: string): PrerenderedArea | null => {
  const doc = new DOMParser().parseFromString(documentText, 'text/html')
  const area = doc.querySelector('[data-area-page]')
  return area ? { path: decodedPath(path), html: area.outerHTML, title: doc.title } : null
}
