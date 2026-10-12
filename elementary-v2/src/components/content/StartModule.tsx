import { ChevronRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { School } from '../../types'
import { findGuide } from '../../content'
import { entryYears, STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import { guidePath } from '../../utils/urlState'
import { currentDetailEntry, track } from '../../utils/analytics'

interface StartModuleProps {
  school: School
  entryYear: number | null
  onOpenGuide: (path: string) => void
}

/**
 * "이 학교 입학을 준비한다면" on the school detail (PRD v2 MVP 1a, W4).
 *
 * This is where a parent lands after searching the school named on their notice,
 * so it is the one place the map hands people to the guides. One guide per stage;
 * a chosen entry year shows only its stage. Without a choice, both stages remain
 * available with the stage of the season first.
 *
 * Private and national schools have no assignment, so their first guide is the
 * one about their applications.
 */
const GUIDE_BY_STAGE: Record<Stage, string> = {
  admission: 'school-notice',
  planning: 'when-to-move',
}

export default function StartModule({ school, entryYear, onOpenGuide }: StartModuleProps) {
  const seasonStage = stageOf(entryYears()[0])
  const stages: Stage[] = entryYear !== null
    ? [stageOf(entryYear)]
    : seasonStage === 'admission' ? ['admission', 'planning'] : ['planning', 'admission']
  const assigned = school.establishment_type === '공립'
  const slugFor = (stage: Stage) => (!assigned && stage === 'admission'
    ? 'private-national'
    : GUIDE_BY_STAGE[stage])

  const open = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    track('click_start_module', {
      school_id: school.school_id,
      guide_id: slug,
      // How this school detail was reached: a parent who arrived from a search
      // engine is the case the whole module exists for.
      entry_source: currentDetailEntry() ?? undefined,
    })
    onOpenGuide(guidePath(slug))
  }

  return (
    <section className="start-module" aria-labelledby="start-module-title">
      <h3 id="start-module-title">이 학교 입학을 준비한다면</h3>
      {stages.map((stage) => {
        const slug = slugFor(stage)
        const guide = findGuide(slug)
        if (!guide) return null
        return (
          <div key={stage} className="start-module__group">
            <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
            <ul>
              <li>
                <a href={guidePath(slug)} onClick={(event) => open(event, slug)}>
                  <span>{guide.title}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>
        )
      })}
    </section>
  )
}
