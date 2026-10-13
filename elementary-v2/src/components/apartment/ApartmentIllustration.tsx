import { APARTMENT_PALETTE, apartmentEra, apartmentSilhouetteCount } from '../../utils/apartmentVisual'

interface ApartmentIllustrationProps {
  households: number
  /** null means unknown; zero is a verified current-year approval. */
  age: number | null
  width?: number
  height?: number
}

// The same shapes across ages: height/roof do not imply an actual exterior.
const HEIGHTS: Record<number, number[]> = {
  1: [34], 2: [34, 40], 3: [30, 40, 34], 4: [30, 40, 34, 28],
}

/** Decorative information symbol; actual household/year data stay in card text. */
export default function ApartmentIllustration({ households, age, width = 64, height = 64 }: ApartmentIllustrationProps) {
  const era = apartmentEra(age)
  const color = APARTMENT_PALETTE[era]
  const count = apartmentSilhouetteCount(households)
  const buildingWidth = count <= 2 ? 15 : 10
  const base = 53
  const gap = 3
  const startX = (64 - (count * buildingWidth + (count - 1) * gap)) / 2

  return (
    <svg width={width} height={height} viewBox="0 0 64 64" aria-hidden="true" focusable="false"
      data-apartment-era={era} data-apartment-scale={count}>
      <rect width="64" height="64" rx="15" fill={color.surface} />
      <ellipse cx="32" cy="55" rx="25" ry="2.5" fill={color.ink} opacity="0.09" />
      {HEIGHTS[count].map((buildingHeight, index) => {
        const x = startX + index * (buildingWidth + gap)
        const top = base - buildingHeight
        const rows = Math.floor((buildingHeight - 12) / 7)
        return (
          <g key={index} data-building-silhouette="true">
            <rect x={x} y={top} width={buildingWidth} height={buildingHeight} rx="2.5"
              fill={color.body} stroke={color.ink} strokeWidth="1.25" />
            {Array.from({ length: rows }, (_, row) => [0, 1].map((column) => (
              <rect key={`${row}-${column}`} x={x + 2.5 + column * (buildingWidth - 5) / 2}
                y={top + 5 + row * 7} width={(buildingWidth - 7) / 2} height="3" rx="0.8" fill={color.detail} />
            )))}
            <rect x={x + buildingWidth / 2 - 1.5} y={base - 6} width="3" height="6" rx="1" fill={color.detail} />
          </g>
        )
      })}
      <g fill="none" stroke={color.ink} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
        <circle cx="53" cy="11" r="5.5" fill={color.surface} />
        <path d="M53 8v3l2 1" />
      </g>
    </svg>
  )
}
