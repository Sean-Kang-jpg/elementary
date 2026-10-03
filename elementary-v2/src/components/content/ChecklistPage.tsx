import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import checklist from '../../content/checklist.json'
import { readChecklist, saveChecklist, subscribeProfile } from '../../utils/profile'
import { track } from '../../utils/analytics'
import { followLink } from './contentLinks'

interface ChecklistPageProps {
  onNavigate: (path: string) => void
}

const TOTAL = checklist.groups.reduce((n, group) => n + group.items.length, 0)

/**
 * The admission checklist (PRD v2 7.4). Checked items are kept on this device
 * only (D1 option A). Item ids are the storage keys, so they never change.
 */
export default function ChecklistPage({ onNavigate }: ChecklistPageProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(readChecklist)
  useEffect(() => subscribeProfile(() => setChecked(readChecklist())), [])
  const done = Object.values(checked).filter(Boolean).length

  const toggle = (groupId: string, itemId: string) => {
    const next = { ...checked, [itemId]: !checked[itemId] }
    if (!next[itemId]) delete next[itemId]
    setChecked(next)
    saveChecklist(next)
    if (next[itemId]) track('check_checklist_item', { category: groupId, item_id: itemId })
  }

  return (
    <section className="app-destination app-page content-page" aria-labelledby="checklist-title">
      <div className="content-page__inner">
        <h1 id="checklist-title">{checklist.title}</h1>
        <p className="content-page__lead">{checklist.description}</p>
        <p className="checklist-note">시기는 참고용이에요. 취학통지서(12월 20일까지)를 빼면 학교마다 다르니 학교 안내를 함께 확인하세요.</p>

        <div className="checklist-progress" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={done} aria-label="체크한 항목">
          <div className="checklist-progress__bar"><span style={{ width: `${Math.round((done / TOTAL) * 100)}%` }} /></div>
          <p><b>{done}</b> / {TOTAL} 완료</p>
        </div>

        {checklist.groups.map((group) => (
          <section key={group.id} className="checklist-group" aria-labelledby={`checklist-${group.id}`}>
            <h2 id={`checklist-${group.id}`}>{group.label}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.id} className={checked[item.id] ? 'is-done' : ''}>
                  <label>
                    <input type="checkbox" checked={Boolean(checked[item.id])} onChange={() => toggle(group.id, item.id)} />
                    <span>{item.text}</span>
                    <small className="checklist-when">{item.when}</small>
                  </label>
                  {'link' in item && item.link ? (
                    <a href={item.link} onClick={(event) => followLink(event, item.link!, onNavigate)} aria-label={`${item.text} 안내 보기`}>
                      <ChevronRight size={16} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
