import { useEffect, useRef } from 'react'

// 주소가 없는 시트(구·동 목록, 필터)를 안드로이드 뒤로 가기로 닫는다.
//
// 시트가 열리면 같은 주소로 기록을 하나 쌓고 그 기록의 state.sheets에 자기 키를
// 남긴다. 뒤로 가기로 그 기록이 빠지면 닫는다. 이 기록이 없으면 뒤로 가기가 아래
// 화면을 넘기고, body에 그려진 시트는 그대로 남는다.
//
// 키를 배열로 쌓는 이유: 구 목록 위에서 동 목록을 열면 [구, 동]이 되고, 동을 닫으면
// 구로 돌아와야 한다. 이미 배열에 있는 키는 다시 쌓지 않는다 — 학교 상세에서 뒤로
// 와서 시트가 다시 열릴 때 기록이 거듭 쌓이지 않게 한다.
const sheetsOf = (state: unknown): string[] => {
  const sheets = (state as { sheets?: unknown } | null)?.sheets
  return Array.isArray(sheets) ? sheets.filter((sheet): sheet is string => typeof sheet === 'string') : []
}

export function useCloseOnBack(key: string | undefined, isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // StrictMode는 효과를 붙였다 떼었다 다시 붙인다. 그 사이의 미룬 확인이 기록을
  // 걷어 내면 시트가 열리자마자 닫히므로, 다시 열려 있으면 건너뛴다.
  const openRef = useRef(false)

  useEffect(() => {
    if (!key || !isOpen) return
    openRef.current = true
    const sheets = sheetsOf(window.history.state)
    if (!sheets.includes(key)) {
      window.history.pushState({ ...(window.history.state ?? {}), sheets: [...sheets, key] }, '', window.location.href)
    }
    const onPopState = (event: PopStateEvent) => {
      if (!sheetsOf(event.state).includes(key)) onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      openRef.current = false
      // X·스와이프로 닫혔다면 쌓아 둔 기록을 걷어 낸다. 같은 커밋에서 다른 시트가
      // 그 자리를 이어받았거나(구 → 동) 학교 상세가 주소를 쌓았다면 맨 위가 이미
      // 이 키가 아니므로 건드리지 않는다. 그래서 한 틱 미룬 뒤에 본다.
      window.setTimeout(() => {
        if (openRef.current) return
        const current = sheetsOf(window.history.state)
        if (current[current.length - 1] === key) window.history.back()
      }, 0)
    }
  }, [key, isOpen])
}
