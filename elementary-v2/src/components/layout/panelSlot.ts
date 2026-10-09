import { createContext, useContext, useEffect, useState } from 'react'

// 데스크톱(1024px 이상)에서는 지도 화면 왼쪽에 고정 패널을 둔다. 네이버 지도처럼
// 모바일의 바텀시트 내용이 그 패널 안에 열리고 지도는 가려지지 않는다.
// BottomSheet가 이 자리를 찾으면 화면 위가 아니라 패널 안에 그린다.
export const DESKTOP_QUERY = '(min-width: 1024px)'

export const PanelSlotContext = createContext<HTMLElement | null>(null)

// 지도는 한 번 열리면 다른 메뉴로 가도 내려가지 않는다(다시 그리는 비용 때문에).
// 그 안에서 여는 구·동 시트는 이 값으로 지도 화면일 때만 연다. 2026-10-09 전에는
// 학교 찾기에서 다른 메뉴를 눌러도 시트가 그 화면 위에 남았다.
export const MapScreenContext = createContext(false)

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop
}

// 데스크톱이고 지도 화면 패널이 있을 때만 그 자리를 돌려준다.
export function usePanelSlot() {
  const slot = useContext(PanelSlotContext)
  const desktop = useIsDesktop()
  return desktop ? slot : null
}
