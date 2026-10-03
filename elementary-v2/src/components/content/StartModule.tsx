import { ChevronRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { School } from '../../types'
import { findGuide } from '../../content'
import { entryYears, STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import { guidePath } from '../../utils/urlState'
import { currentDetailEntry, track } from '../../utils/analytics'

interface StartModuleProps {
  school: School
  onOpenGuide: (path: string) => void
}

/**
 * "이 학교 입학을 준비한다면" on the school detail (PRD v2 MVP 1a, W4).
 *
 * This is where a parent lands after searching the school named on their notice,
 * so it is the one place the map hands people to the guides. Two guides per stage,
 * the stage of the season first: from September to March most visitors are
 * holding a notice; the rest of the year they are deciding where to live.
 *
 * Private and national schools have no assignment, so their first guide is the
 * one about their applications.
 */
const GUIDES_BY_STAGE: Record<Stage, string[]> = {
  admission: ['school-notice', 'preliminary-call'],
  planning: ['when-to-move', 'check-school-zone'],
}

export default function StartModule({ school, onOpenGuide }: StartModuleProps) {
  const seasonStage = stageOf(entryYears()[0])
  const stages: Stage[] = seasonStage === 'admission' ? ['admission', 'planning'] : ['planning', 'admission']
  const assigned = school.establishment_type === '공립'
  const slugsFor = (stage: Stage) => (!assigned && stage === 'admission'
    ? ['private-national', 'school-notice']
    : GUIDES_BY_STAGE[stage])

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
      {stages.map((stage) => (
        <div key={stage} className="start-module__group">
          <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
          <ul>
            {slugsFor(stage).map((slug) => {
              const guide = findGuide(slug)
              if (!guide) return null
              return (
                <li key={slug}>
                  <a href={guidePath(slug)} onClick={(event) => open(event, slug)}>
                    <span>{guide.title}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
