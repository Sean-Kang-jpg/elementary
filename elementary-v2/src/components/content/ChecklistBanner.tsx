import { useEffect, useState } from 'react'
import { ChevronRight, ListChecks } from 'lucide-react'
import checklist from '../../content/checklist.json'
import { readChecklist, subscribeProfile } from '../../utils/profile'
import { VIEW_PATHS } from '../../utils/urlState'
import { followLink } from './contentLinks'

const IDS = checklist.groups.flatMap((group) => group.items.map((item) => item.id))
const TOTAL = IDS.length
// The checklist storage also holds roadmap ticks from 우리집 일정 (UX-03), so count only checklist items.
const countDone = () => {
  const checked = readChecklist()
  return IDS.filter((id) => checked[id]).length
}

/**
 * A slim link to the checklist with this device's progress. Placed under every
 * guide, on the 입학 준비 list and in MY, so the checklist is one tap from wherever a
 * parent is reading.
 */
export default function ChecklistBanner({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [done, setDone] = useState(countDone)
  useEffect(() => subscribeProfile(() => setDone(countDone())), [])
  const percent = Math.round((done / TOTAL) * 100)

  return (
    <a href={VIEW_PATHS.checklist} onClick={(event) => followLink(event, VIEW_PATHS.checklist, onNavigate)} className="checklist-banner">
      <span className="checklist-banner__icon"><ListChecks size={20} aria-hidden="true" /></span>
      <span className="checklist-banner__text">
        <strong>입학 준비 체크리스트</strong>
        <small>{done ? `${TOTAL}개 중 ${done}개 챙겼어요` : '취학통지서부터 준비물까지 17가지'}</small>
        <span className="checklist-banner__bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  )
}
