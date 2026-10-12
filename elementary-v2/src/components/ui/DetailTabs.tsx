interface DetailTabsProps<T extends string> {
  label: string
  tabs: ReadonlyArray<{ key: T; label: string; disabled?: boolean }>
  value: T
  onChange: (value: T) => void
}

export default function DetailTabs<T extends string>({ label, tabs, value, onChange }: DetailTabsProps<T>) {
  return (
    <nav className="detail-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" disabled={tab.disabled} aria-pressed={value === tab.key}
          onClick={() => onChange(tab.key)} className={value === tab.key ? 'detail-tabs__selected' : undefined}>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
