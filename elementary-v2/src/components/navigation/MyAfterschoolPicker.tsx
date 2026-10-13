import { useEffect, useState } from 'react'
import { getSchoolAfterschool } from '../../services/dataService'
import type { SchoolAfterschool } from '../../types'
import { afterschoolEntryFromSection, afterschoolSectionId, afterschoolSectionLabel } from '../../utils/schedule/fromSchoolData'
import type { ScheduleEntry } from '../../utils/schedule/types'

export interface EntryDraft {
  label: string
  start: string
  end: string
  source: ScheduleEntry['source']
}

/**
 * 학교 방과후·맞춤형 강좌(SQL 30)에서 반을 골라 후보 일정으로 넣는다. 요일이 적힌 반은 바로 넣고,
 * 요일이 없는 반은 일정 추가 양식에 이름·시각을 채워 부모가 요일을 고르게 한다.
 * 강좌표가 없는 학교는 직접 추가하도록 안내한다(2026-10-14 결정: 목록만 있어도 보여 주고 부모가 고친다).
 */
export default function MyAfterschoolPicker({ schoolId, entries, onAdd, onDraft }: {
  schoolId: string
  entries: ScheduleEntry[]
  onAdd: (entry: ScheduleEntry) => boolean
  onDraft: (draft: EntryDraft) => void
}) {
  const [data, setData] = useState<SchoolAfterschool | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    setData(undefined)
    getSchoolAfterschool(schoolId, { allowDevFixture: false })
      .then((result) => { if (active) setData(result) })
      .catch(() => { if (active) setData(null) })
    return () => { active = false }
  }, [schoolId])

  if (data === undefined) return null
  if (data === null || data.options.length === 0) {
    return <p className="my-help">이 학교의 1학년 방과후·맞춤형 강좌 시간표는 아직 확인하지 못했어요. 학교 공지를 보고 아래 ‘일정 추가’로 직접 넣어 주세요.</p>
  }
  const options = [...data.options.filter((o) => o.grade1 === 'true'), ...data.options.filter((o) => o.grade1 !== 'true')]
  const added = new Set(entries.map((e) => e.id))
  return <details className="my-entry-form my-afterschool-pick">
    <summary>이 학교 방과후 강좌에서 골라 넣기 ({options.length})</summary>
    <p className="my-help">
      {data.source_year}학년도 운영계획 기준이에요. 고른 반은 ‘후보’로 들어가고, 시각은 일정 관리에서 고칠 수 있어요.
      {data.tier === 'C' && ' 이 학교는 운영계획에 강좌 시간이 적혀 있지 않아 요일·시간을 직접 골라야 해요.'}
    </p>
    <ul>
      {options.map((option) => (
        <li key={`${option.kind}-${option.name}-${option.variant ?? ''}`}>
          <b>{option.kind === '맞춤형' ? '맞춤형 ' : ''}{option.name}{option.variant ? ` (${option.variant})` : ''}</b>
          <small>{option.category}{option.grade1 !== 'true' && ' · 1학년 대상인지 학교 확인 필요'}</small>
          <div className="my-actions">
            {option.sections.map((section, index) => {
              const id = afterschoolSectionId(schoolId, option, section)
              const time = section.days
                ? `${section.days} ${section.start ? `${section.start}–` : ''}${section.end ?? '시간 미기재'}`
                : `요일·시간 직접 넣기${section.end ? ` (~${section.end})` : ''}`
              return <button
                key={`${id}-${index}`}
                type="button"
                className="my-button"
                disabled={added.has(id)}
                aria-label={`${afterschoolSectionLabel(option, section)} ${time} ${added.has(id) ? '추가됨' : '후보로 넣기'}`}
                onClick={() => {
                  const entry = afterschoolEntryFromSection(schoolId, data.source_year, option, section)
                  if (entry) onAdd(entry)
                  else onDraft({ label: afterschoolSectionLabel(option, section), start: section.start ?? '', end: section.end ?? '',
                    source: { ref: `school_afterschool:${schoolId}`, version: `${data.source_year} 운영계획` } })
                }}
              >{section.section ? `${section.section} · ` : ''}{time}{added.has(id) ? ' · 추가됨' : ''}</button>
            })}
          </div>
        </li>
      ))}
    </ul>
  </details>
}
