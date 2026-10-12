import { BadgeJapaneseYen, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApartmentTransactionSummaries } from '../../services/dataService'
import type { ApartmentTransactionSummary as TransactionSummary } from '../../types'

const BAND_ORDER: TransactionSummary['area_band'][] = [
  'under_60',
  '60_to_84_9999',
  '85_to_101_9999',
  '102_plus',
]

const BAND_LABELS: Record<TransactionSummary['area_band'], string> = {
  under_60: '60㎡ 미만',
  '60_to_84_9999': '60~84㎡',
  '85_to_101_9999': '85~101㎡',
  '102_plus': '102㎡ 이상',
}

const formatMonth = (value: string) => {
  const [year, month] = value.slice(0, 7).split('-')
  return `${year}년 ${Number(month)}월`
}

const formatAmount = (amount10kKrw: number) => {
  const rounded = Math.round(amount10kKrw)
  const eok = Math.floor(rounded / 10000)
  const man = rounded % 10000
  if (!eok) return `${man.toLocaleString()}만원`
  return man ? `${eok.toLocaleString()}억 ${man.toLocaleString()}만원` : `${eok.toLocaleString()}억원`
}

interface ApartmentTransactionSummaryProps {
  publicKey: string
}

export default function ApartmentTransactionSummary({ publicKey }: ApartmentTransactionSummaryProps) {
  const [rows, setRows] = useState<TransactionSummary[] | null>(null)

  useEffect(() => {
    setRows(null)
    if (!publicKey) {
      setRows([])
      return
    }
    let active = true
    getApartmentTransactionSummaries(publicKey)
      .then((value) => { if (active) setRows(value) })
      .catch((error) => {
        console.error('아파트 실거래가 조회 실패:', error)
        if (active) setRows([])
      })
    return () => { active = false }
  }, [publicKey])

  if (rows === null) {
    return (
      <section aria-labelledby="apartment-transaction-title">
        <h3 id="apartment-transaction-title" className="mb-2 inline-flex items-center gap-2 font-semibold text-gray-950"><BadgeJapaneseYen size={18} aria-hidden="true" />최근 실거래가</h3>
        <LoaderCircle className="animate-spin text-teal-700" size={18} aria-label="실거래가 불러오는 중" />
      </section>
    )
  }
  if (!rows.length) return null

  const ordered = [...rows].sort((left, right) => BAND_ORDER.indexOf(left.area_band) - BAND_ORDER.indexOf(right.area_band))
  return (
    <section aria-labelledby="apartment-transaction-title" data-testid="apartment-transactions">
      <h3 id="apartment-transaction-title" className="mb-2 inline-flex items-center gap-2 font-semibold text-gray-950"><BadgeJapaneseYen size={18} aria-hidden="true" />최근 실거래가</h3>
      <dl className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {ordered.map((row) => (
          <div key={row.area_band} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 px-3 py-2.5">
            <dt className="text-sm font-semibold text-gray-900">{BAND_LABELS[row.area_band]}</dt>
            <dd className="text-[11px] text-gray-500">{formatMonth(row.deal_month)} · {row.transaction_count.toLocaleString()}건</dd>
            <dd className="text-right text-sm font-semibold text-teal-900">{formatAmount(row.median_amount_10k_krw)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-gray-500">국토교통부 실거래가 공개시스템 기반 면적대별 중위가격입니다. 실제 동·층·향에 따라 다를 수 있습니다.</p>
    </section>
  )
}
