import { birthYearOf, entryYears, STAGE_LABELS, stageOf } from '../../utils/entryYear'

interface EntryYearPickerProps {
  value: number | null
  onChange: (year: number) => void
  /** Shown above the chips. */
  label?: string
}

/** Three chips - one per entry year still ahead - with the birth year beside each. */
export default function EntryYearPicker({ value, onChange, label = '우리 아이는 언제 입학하나요?' }: EntryYearPickerProps) {
  return (
    <div className="year-picker" role="group" aria-label={label}>
      <p className="year-picker__label">{label}</p>
      <div className="year-picker__chips">
        {entryYears().map((year) => {
          const selected = value === year
          return (
            <button
              key={year}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(year)}
              className={`year-chip year-chip--${stageOf(year)} ${selected ? 'year-chip--selected' : ''}`}
            >
              <strong>{year}년 입학</strong>
              <small>{birthYearOf(year)}년생</small>
            </button>
          )
        })}
      </div>
      {value ? (
        <p className={`year-picker__stage year-picker__stage--${stageOf(value)}`}>
          지금은 <b>{STAGE_LABELS[stageOf(value)].long}</b> 단계예요.
        </p>
      ) : null}
    </div>
  )
}
