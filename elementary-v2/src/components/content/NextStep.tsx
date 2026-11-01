import type { GuideNextStep } from '../../content'
import { markEntry } from '../../utils/analytics'
import { followLink } from './contentLinks'

/** The same label and destination are rendered into static guide pages at build time. */
export default function NextStep({ nextStep, onNavigate }: {
  nextStep: GuideNextStep
  onNavigate: (path: string) => void
}) {
  return (
    <a
      href={nextStep.href}
      className="my-button my-button--primary my-4 flex min-h-11 items-center justify-center text-center"
      data-testid="guide-next-step"
      data-next-step-kind={nextStep.kind}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        markEntry('guides')
        followLink(event, nextStep.href, onNavigate)
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
      {nextStep.label}
    </a>
  )
}
