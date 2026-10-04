import React, { useEffect, useState } from 'react'
import { getDataFreshness, type DataFreshness as Freshness } from '../../services/dataService'

/** Which sources a screen rests on, in the order they are named. */
const LABELS: Record<string, string> = {
  'schoolinfo-grade-students': '학생 수',
  'kapt-basic': '아파트 정보',
}

/** Who publishes each source, credited only where that source is shown. */
const PUBLISHERS: Record<string, string> = {
  'schoolinfo-grade-students': '학교알리미',
  'kapt-basic': '공동주택관리정보시스템',
}

const formatDate = (value: string) => value.replace(/-/g, '.')

/**
 * "학생 수 2026.08.29 · 아파트 정보 2026.10.02 기준" under a detail screen, so a
 * parent can tell how current the numbers are. Renders nothing until the dates
 * arrive, or at all when the database does not publish them yet (SQL 22).
 */
const DataFreshness: React.FC<{ sources: string[] }> = ({ sources }) => {
  const [rows, setRows] = useState<Freshness[]>([])
  useEffect(() => {
    let active = true
    void getDataFreshness().then((value) => { if (active) setRows(value) })
    return () => { active = false }
  }, [])

  const parts = sources
    .map((name) => {
      const row = rows.find((item) => item.source_name === name)
      return row?.source_as_of ? `${LABELS[name] ?? name} ${formatDate(row.source_as_of)}` : null
    })
    .filter(Boolean)
  if (!parts.length) return null
  const publishers = [...new Set(sources.map((name) => PUBLISHERS[name]).filter(Boolean))]

  return (
    <p className="mt-4 text-[11px] leading-4 text-gray-400" data-testid="data-freshness">
      {parts.join(' · ')} 기준 · 출처 {publishers.join('·')}
    </p>
  )
}

export default DataFreshness
