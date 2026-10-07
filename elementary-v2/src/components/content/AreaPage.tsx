import { useEffect, useState } from 'react'
import { decodedPath, extractArea, takePrerendered } from '../../utils/prerendered'
import { VIEW_PATHS } from '../../utils/urlState'
import { followInternalLink, followLink } from './contentLinks'

interface AreaPageProps {
  path: string
  onNavigate: (path: string) => void
}

type AreaContent = ReturnType<typeof takePrerendered>

/**
 * 지역 허브(`/area`, `/area/서울`, `/area/서울/강남구`).
 *
 * 내용은 서버(api/detail.js)가 만든 HTML을 그대로 보여준다. 수천 행을 읽어 표를
 * 짜는 일이 이미 거기 있고, 검색엔진이 읽는 것과 사람이 보는 것이 같아야 하기
 * 때문이다. 처음 열린 주소라면 문서에 이미 있는 내용을, 앱 안에서 옮겨 왔다면 그
 * 주소의 HTML을 받아 온다. 안의 링크는 앱 안에서 연다 — 학교를 누르면 지도 위
 * 상세가 열린다.
 *
 * 개발 서버에는 이 함수가 없어 받아 온 문서에 허브가 없다. 그때는 안내만 한다.
 */
export default function AreaPage({ path, onNavigate }: AreaPageProps) {
  const [content, setContent] = useState<AreaContent>(() => takePrerendered(path))
  const [failed, setFailed] = useState(false)
  const shown = content && content.path === decodedPath(path) ? content : null

  useEffect(() => {
    if (shown) return
    let active = true
    setFailed(false)
    fetch(path, { headers: { Accept: 'text/html' } })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`${response.status}`))))
      .then((text) => {
        if (!active) return
        const area = extractArea(path, text)
        if (area) setContent(area)
        else setFailed(true)
      })
      .catch((error) => {
        console.error('지역 허브를 불러오지 못했습니다:', error)
        if (active) setFailed(true)
      })
    return () => { active = false }
  }, [path, shown])

  // 제목은 서버가 정한 것을 쓴다. 학교 수 같은 수치가 들어 있어 여기서 다시 짓지 않는다.
  useEffect(() => {
    if (shown?.title) document.title = shown.title
  }, [shown])

  if (shown) {
    return (
      <div
        style={{ display: 'contents' }}
        onClick={(event) => followInternalLink(event, onNavigate)}
        dangerouslySetInnerHTML={{ __html: shown.html }}
      />
    )
  }

  return (
    <section className="app-destination app-page content-page area-page" aria-busy={!failed}>
      <div className="content-page__inner">
        {failed ? (
          <>
            <p className="content-page__lead">지역 정보를 불러오지 못했습니다.</p>
            <a className="content-list__item content-list__item--card" href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>
              <span><strong>지도에서 학교 찾기</strong><small>지역을 확대하면 학교가 보입니다</small></span>
            </a>
          </>
        ) : (
          <p className="content-page__lead">불러오는 중</p>
        )}
      </div>
    </section>
  )
}
