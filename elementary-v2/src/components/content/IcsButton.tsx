import { useState } from 'react'
import { trackIcsExport } from '../../utils/analytics'
import { createIcs, type IcsItem } from '../../utils/ics'

interface IcsButtonProps {
  items: readonly IcsItem[]
  className?: string
  siteOrigin?: string
}

/** The 입학까지 card (RoadmapCard, UX-03) passes its dated entries; this button does not read or write device storage. */
export default function IcsButton({ items, className = 'my-button', siteOrigin }: IcsButtonProps) {
  const [error, setError] = useState(false)
  const download = () => {
    setError(false)
    let objectUrl: string | undefined
    const anchor = document.createElement('a')
    try {
      // SITE_ORIGIN is stamped into the canonical by Vite; VITE_SITE_ORIGIN also
      // supports shell screens without one. Local/preview hosts are never used.
      const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
      const buildOrigin = (import.meta as ImportMeta & { env: { VITE_SITE_ORIGIN?: string } }).env.VITE_SITE_ORIGIN
      const origin = siteOrigin || (canonical ? new URL(canonical).origin : buildOrigin) || 'https://wherecho.co.kr'
      const content = createIcs(items, { generatedAt: new Date(), siteOrigin: origin })
      objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
      anchor.href = objectUrl
      anchor.download = 'wherecho-plan.ics'
      document.body.appendChild(anchor)
      anchor.click()
      trackIcsExport({ count: items.length })
    } catch {
      setError(true)
    } finally {
      anchor.remove()
      // Give the browser time to consume the download before releasing its URL.
      if (objectUrl) {
        const pendingUrl = objectUrl
        window.setTimeout(() => URL.revokeObjectURL(pendingUrl), 1000)
      }
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={items.length === 0} onClick={download}>캘린더에 넣기</button>
      {error && <p role="alert">캘린더 파일을 만들지 못했어요. 일정을 확인해 주세요.</p>}
    </>
  )
}
