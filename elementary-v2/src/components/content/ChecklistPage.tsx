import { useEffect, useState } from 'react'
import {
  Backpack, Check, ChevronRight, ClipboardList, CupSoda, FileText, Footprints, HeartHandshake, House,
  LampDesk, Pencil, PencilLine, Phone, Route, School, Smartphone, Sun, Tag, Umbrella, type LucideIcon,
} from 'lucide-react'
import checklist from '../../content/checklist.json'
import { readChecklist, readProfile, saveChecklist, subscribeProfile } from '../../utils/profile'
import { daysToEntry } from '../../utils/roadmap'
import { track } from '../../utils/analytics'
import { VIEW_PATHS } from '../../utils/urlState'
import ShareButton from '../ui/ShareButton'
import { followLink } from './contentLinks'

interface ChecklistPageProps {
  onNavigate: (path: string) => void
}

interface Item { id: string; text: string; when: string; icon: string; link?: string }
interface Group { id: string; label: string; hint: string; icon: string; layout: string; items: Item[] }

/** The icon names checklist.json may use. */
const ICONS: Record<string, LucideIcon> = {
  Backpack, ClipboardList, CupSoda, FileText, Footprints, HeartHandshake, House, LampDesk,
  Pencil, PencilLine, Phone, Route, School, Smartphone, Sun, Tag, Umbrella,
}
const iconOf = (name: string) => ICONS[name] ?? ClipboardList

const GROUPS = checklist.groups as Group[]
const ITEMS = GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group })))
const TOTAL = ITEMS.length

/** Order of a `when` label in the run-up to March: December first. */
const whenRank = (when: string) => {
  const month = Number(when.match(/(\d+)월/)?.[1] ?? 99)
  return month === 12 ? 0 : month
}

/**
 * The admission checklist (PRD v2 7.4). Checked items are kept on this device
 * only (D1 option A); item ids are the storage keys, so they never change.
 *
 * Laid out to be read at a glance: a progress ring with the next thing to do,
 * one card per area with its own count, and the supplies as tiles to tap.
 */
export default function ChecklistPage({ onNavigate }: ChecklistPageProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(readChecklist)
  useEffect(() => subscribeProfile(() => setChecked(readChecklist())), [])
  const done = ITEMS.filter((item) => checked[item.id]).length
  const percent = Math.round((done / TOTAL) * 100)
  const entryYear = readProfile().entryYear
  const next = ITEMS
    .filter((item) => !checked[item.id])
    .sort((a, b) => whenRank(a.when) - whenRank(b.when))[0]

  const toggle = (groupId: string, itemId: string) => {
    const nextState = { ...checked, [itemId]: !checked[itemId] }
    if (!nextState[itemId]) delete nextState[itemId]
    setChecked(nextState)
    saveChecklist(nextState)
    if (nextState[itemId]) track('check_checklist_item', { category: groupId, item_id: itemId })
  }

  // The ring: a circle whose stroke is drawn to the share done.
  const radius = 34
  const circumference = 2 * Math.PI * radius

  return (
    <section className="app-destination app-page content-page" aria-labelledby="checklist-title">
      <div className="content-page__inner">
        <div className="content-page__titlebar">
          <h1 id="checklist-title">{checklist.title}</h1>
          {/* The address only: ticks stay on each device (decided 2026-10-04). */}
          <ShareButton path={VIEW_PATHS.checklist} title={checklist.title} text={checklist.description} label="공유" />
        </div>
        <p className="content-page__lead">{checklist.description}</p>

        <div className="checklist-hero" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={done} aria-label="체크한 항목">
          <svg className="checklist-hero__ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r={radius} className="checklist-hero__track" />
            <circle
              cx="40" cy="40" r={radius}
              className="checklist-hero__value"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - done / TOTAL)}
            />
            <text x="40" y="44" textAnchor="middle" className="checklist-hero__percent">{percent}%</text>
          </svg>
          <div className="checklist-hero__text">
            <p className="checklist-hero__count"><b>{done}</b> / {TOTAL} 완료</p>
            {entryYear ? <p className="checklist-hero__dday">입학까지 약 D-{daysToEntry(entryYear)}</p> : null}
            {next ? (
              <p className="checklist-hero__next">다음 할 일 · <b>{next.text}</b> <span>{next.when}</span></p>
            ) : <p className="checklist-hero__next"><b>모두 챙겼어요!</b></p>}
          </div>
        </div>

        <p className="checklist-note">
          시기는 참고용이에요. 취학통지서(12월 20일까지)를 빼면 학교마다 다르니 학교 안내를 함께 확인하세요.
          체크한 내용은 이 기기에만 저장돼요. 링크를 공유하면 받는 분은 자기 기기에서 따로 체크해요.
        </p>

        {GROUPS.map((group) => {
          const GroupIcon = iconOf(group.icon)
          const groupDone = group.items.filter((item) => checked[item.id]).length
          return (
            <section key={group.id} className={`checklist-card checklist-card--${group.id}`} aria-labelledby={`checklist-${group.id}`}>
              <header className="checklist-card__header">
                <span className="checklist-card__icon"><GroupIcon size={20} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <h2 id={`checklist-${group.id}`}>{group.label}</h2>
                  <small>{group.hint}</small>
                </span>
                <span className={`checklist-card__count ${groupDone === group.items.length ? 'is-complete' : ''}`}>
                  {groupDone}/{group.items.length}
                </span>
              </header>

              {group.layout === 'tiles' ? (
                <ul className="checklist-tiles">
                  {group.items.map((item) => {
                    const ItemIcon = iconOf(item.icon)
                    const isDone = Boolean(checked[item.id])
                    return (
                      <li key={item.id}>
                        <button type="button" aria-pressed={isDone} onClick={() => toggle(group.id, item.id)} className={`checklist-tile ${isDone ? 'is-done' : ''}`}>
                          <span className="checklist-tile__icon"><ItemIcon size={24} aria-hidden="true" /></span>
                          <span className="checklist-tile__label">{item.text}</span>
                          {isDone ? <span className="checklist-tile__check"><Check size={13} strokeWidth={3} aria-hidden="true" /></span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul className="checklist-rows">
                  {group.items.map((item) => {
                    const ItemIcon = iconOf(item.icon)
                    const isDone = Boolean(checked[item.id])
                    return (
                      <li key={item.id} className={isDone ? 'is-done' : ''}>
                        <label>
                          <input type="checkbox" checked={isDone} onChange={() => toggle(group.id, item.id)} />
                          <span className="checklist-rows__box" aria-hidden="true">{isDone ? <Check size={14} strokeWidth={3} /> : <ItemIcon size={15} />}</span>
                          <span className="checklist-rows__text">
                            <span>{item.text}</span>
                            <small>{item.when}</small>
                          </span>
                        </label>
                        {item.link ? (
                          <a href={item.link} onClick={(event) => followLink(event, item.link!, onNavigate)} aria-label={`${item.text} 안내 보기`}>
                            <ChevronRight size={16} aria-hidden="true" />
                          </a>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}

        <p className="checklist-tiles-note">준비물은 대부분 <b>2월 중순까지</b> 챙기면 돼요. 학교에서 따로 안내하는 준비물이 있으면 그것을 따르세요.</p>
      </div>
    </section>
  )
}
