import { Check, Link2, Share2 } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { absoluteUrl } from '../../utils/urlState'
import { itemOfPath, track } from '../../utils/analytics'

interface ShareButtonProps {
  /** 공유할 정규 경로. 아직 주소가 없는 대상이면 `null`을 넘긴다. */
  path: string | null
  /** 공유 시트에 보일 제목. */
  title: string
  /** 공유 시트에 보일 한 줄 설명. */
  text?: string
}

type Outcome = 'idle' | 'copied' | 'failed'

/**
 * 클립보드에 쓴다. 정해진 시간 안에 끝나지 않으면 실패로 본다.
 *
 * `writeText`는 거부되는 대신 **매달릴 수 있다** — 권한이 보류된 문맥에서
 * 실제로 그렇다. 그대로 기다리면 사용자는 아무 피드백도 받지 못하고, 버튼을
 * 눌렀는데 아무 일도 일어나지 않는 것이 가장 나쁜 결과다. 그럴 때는 주소를
 * 직접 복사할 수 있게 보여준다.
 */
const CLIPBOARD_TIMEOUT_MS = 1500

const copyToClipboard = (value: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('no clipboard'))
  return Promise.race([
    navigator.clipboard.writeText(value),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('clipboard timed out')), CLIPBOARD_TIMEOUT_MS)
    }),
  ])
}

/**
 * 상세 화면의 주소를 공유한다.
 *
 * 주소를 만들어 두고 복사할 방법을 주지 않으면 반쪽이다. 모바일에서는
 * 주소창이 잘 보이지 않고, 이 앱은 앱처럼 쓰이므로 더 그렇다.
 *
 * 기기의 공유 시트를 우선 쓰고(카카오톡으로 바로 보낼 수 있는 유일한 길),
 * 없으면 클립보드에 복사한다. 둘 다 막히면 주소를 선택된 상태로 보여줘서
 * 사용자가 직접 복사할 수 있게 한다 — 조용히 실패하지 않는다.
 */
const ShareButton: React.FC<ShareButtonProps> = ({ path, title, text }) => {
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  const announce = (next: Outcome) => {
    setOutcome(next)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setOutcome('idle'), 2200)
  }

  // 키가 아직 발급되지 않은 대상은 주소가 없다. 버튼을 보여주고 아무 일도
  // 일어나지 않는 것보다 감추는 편이 정직하다.
  if (!path) return null

  const url = absoluteUrl(path)
  const canNativeShare = typeof (navigator as { share?: unknown }).share === 'function'

  const share = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({ title, text, url })
        track('share_item', { ...itemOfPath(path), share_method: 'web_share' })
        return
      } catch (error) {
        // 사용자가 공유 시트를 닫은 것은 실패가 아니다.
        if (error instanceof DOMException && error.name === 'AbortError') return
        // 그 밖의 거부는 클립보드로 넘어간다.
      }
    }
    try {
      await copyToClipboard(url)
      track('share_item', { ...itemOfPath(path), share_method: 'copy' })
      announce('copied')
    } catch {
      announce('failed')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="이 페이지 공유"
        data-testid="share-button"
        data-share-url={url}
        className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        {outcome === 'copied'
          ? <Check size={21} className="text-emerald-600" aria-hidden="true" />
          : canNativeShare
            ? <Share2 size={21} aria-hidden="true" />
            : <Link2 size={21} aria-hidden="true" />}
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {outcome === 'copied' ? '주소를 복사했습니다' : outcome === 'failed' ? '주소를 복사하지 못했습니다' : ''}
      </span>

      {outcome !== 'idle' && (
        <div className="pointer-events-auto absolute right-2 top-12 z-20 max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-gray-200 bg-white px-3 py-2 shadow-lg">
          {outcome === 'copied' ? (
            <p className="text-xs font-medium text-gray-900">주소를 복사했습니다</p>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-900">복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.</p>
              <input
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="공유 주소"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
              />
            </>
          )}
        </div>
      )}
    </>
  )
}

export default ShareButton
