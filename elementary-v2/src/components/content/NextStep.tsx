import { useState, useSyncExternalStore } from 'react'
import type { GuideNextStep } from '../../content'
import { markEntry, track } from '../../utils/analytics'
import { addToPlan, isInPlan, subscribeFamilyPlan } from '../../utils/familyPlan'
import { followLink } from './contentLinks'

/** The same label and destination are rendered into static guide pages at build time. */
export default function NextStep({ nextStep, slug, compact = false, onNavigate }: {
  nextStep: GuideNextStep
  slug: string
  compact?: boolean
  onNavigate: (path: string) => void
}) {
  const item = nextStep.planItem
  const inPlan = useSyncExternalStore(subscribeFamilyPlan, () => Boolean(item && isInPlan(item.id)), () => false)
  const [failed, setFailed] = useState(false)
  const href = item && inPlan ? `${nextStep.href}&item=${encodeURIComponent(item.id)}` : nextStep.href
  const label = item && inPlan ? '담은 할 일 보기' : nextStep.label
  return (
    <aside className="guide-next-action" aria-label="다음 한 걸음">
      {!compact && nextStep.description && <p>{nextStep.description}</p>}
      {!compact && item && <>
        <p><strong>{item.title}</strong></p>
        <button type="button" className="my-button" disabled={inPlan} data-testid="guide-plan-add"
          onClick={() => {
            const saved = addToPlan({ id: item.id, title: item.title, href: `/guide/${slug}`, when: { kind: 'anytime' } }, { from: 'guide', contentId: slug })
            setFailed(!saved)
          }}>{inPlan ? '우리집 일정에 담았어요' : '이 할 일을 우리집 일정에 담기'}</button>
        <p className="my-help" role="status">{failed ? '저장하지 못했어요. 다시 눌러 주세요.' : inPlan ? '입학까지의 ‘언제든’ 목록에서 확인하고, 끝내면 체크하세요.' : '날짜 없는 할 일로 이 기기에 저장돼요. 입학연도나 관심 학교는 바뀌지 않아요.'}</p>
      </>}
      <a
        href={href}
        className="my-button my-button--primary my-4 flex min-h-11 items-center justify-center text-center"
        data-testid={compact || !nextStep.description ? 'guide-next-step' : 'guide-next-step-preview'}
        data-next-step-kind={nextStep.kind}
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          track('guide_next_step_click', { content_id: slug, face: nextStep.href.includes('face=week') ? 'week' : nextStep.href.includes('face=timeline') ? 'timeline' : undefined })
          markEntry('guides')
          followLink(event, href, onNavigate)
          // The parent's generic content-navigation callback marks `related`.
          // Keep this CTA's explicit source after that synchronous callback too.
          markEntry('guides')
          if (nextStep.href === '/map') {
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()
            })
          }
        }}
      >
        {label}
      </a>
    </aside>
  )
}
