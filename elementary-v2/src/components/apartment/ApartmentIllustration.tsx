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
  1: [24], 2: [24, 30], 3: [23, 31, 25], 4: [21, 31, 25, 19],
}

// Soft toy-block faces share the age meaning of the text badge. Landscape is
// identical for every era; trees/flowers never imply actual estate amenities.
const FACADES = {
  new: { front: '#c5d6e8', side: '#9bb4cd', roof: '#849fb9' },
  mid: { front: '#b6dbca', side: '#87b69f', roof: '#75a98f' },
  old: { front: '#ead0a5', side: '#cdae80', roof: '#bb9866' },
  unknown: { front: '#d3dade', side: '#adbcc4', roof: '#94a5ae' },
} as const

/** Decorative information symbol; actual household/year data stay in card text. */
export default function ApartmentIllustration({ households, age, width = 64, height = 64 }: ApartmentIllustrationProps) {
  const era = apartmentEra(age)
  const color = APARTMENT_PALETTE[era]
  const facade = FACADES[era]
  const count = apartmentSilhouetteCount(households)
  const buildingWidth = count === 1 ? 20 : count === 2 ? 16 : count === 3 ? 12 : 10
  const base = 49
  const gap = 3
  const startX = (64 - (count * buildingWidth + (count - 1) * gap + 3)) / 2

  return (
    <svg width={width} height={height} viewBox="0 0 64 64" aria-hidden="true" focusable="false"
      data-apartment-era={era} data-apartment-scale={count} data-apartment-style="miniature">
      <rect width="64" height="64" rx="18" fill={color.surface} />
      <circle cx="49" cy="12" r="5" fill="#f3d69f" opacity="0.85" />
      <path d="M9 15c0-2 2-3 4-3 0-3 5-4 7-1 3-1 5 1 5 3 0 2-2 3-4 3H13c-2 0-4 0-4-2Z" fill="#fff" opacity="0.85" />
      <g data-scene-garden="true">
        <ellipse cx="32" cy="51" rx="28" ry="9" fill="#dfecd9" />
        <ellipse cx="32" cy="51" rx="22" ry="3.5" fill="#769785" opacity="0.13" />
        <path d="M28 49h7c-2 4-1 7 4 11H27c4-4 4-7 1-11Z" fill="#f8edd7" />
      </g>
      {HEIGHTS[count].map((buildingHeight, index) => {
        const x = startX + index * (buildingWidth + gap)
        const top = base - buildingHeight
        const rows = Math.floor((buildingHeight - 9) / 7)
        return (
          <g key={index} data-building-silhouette="true">
            <rect x={x} y={top} width={buildingWidth} height={buildingHeight} rx="2.5"
              fill={facade.front} stroke={color.ink} strokeOpacity="0.35" strokeWidth="0.7" />
            <path d={`M${x + buildingWidth - 1} ${top + 1}l4-3v${buildingHeight - 1}l-4 3Z`} fill={facade.side} />
            <path d={`M${x + 1} ${top}l3-3h${buildingWidth - 1}l-3 3Z`} fill={facade.roof} />
            {Array.from({ length: rows }, (_, row) => [0, 1].map((column) => (
              <rect key={`${row}-${column}`} x={x + 2 + column * buildingWidth / 2}
                y={top + 5 + row * 7} width={buildingWidth / 2 - 3} height="3.8" rx="1.1" fill="#fffaf0" />
            )))}
            <rect x={x + buildingWidth / 2 - 2} y={base - 5} width="4" height="5" rx="1.5" fill={facade.roof} />
            <path d={`M${x + buildingWidth / 2 - 3} ${base - 5}h6`} stroke="#fffaf0" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        )
      })}
      <g data-scene-plants="true">
        <path d="M8 50v-6m48 7v-7" stroke="#b69c7c" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M8 45l-2-2m50 3l2-2" stroke="#b69c7c" strokeWidth="1" strokeLinecap="round" />
        <circle cx="7" cy="41" r="3.5" fill="#9bc5a4" />
        <circle cx="10" cy="43" r="3" fill="#82b796" />
        <circle cx="5" cy="43" r="2.6" fill="#acd1ad" />
        <circle cx="56" cy="41" r="3.5" fill="#9bc5a4" />
        <circle cx="59" cy="44" r="2.5" fill="#82b796" />
        <path d="M12 55v-3m7 5v-3m32 1v-2" stroke="#8db696" strokeWidth="1" strokeLinecap="round" />
        <circle cx="12" cy="51.5" r="1.7" fill="#eab4b1" />
        <circle cx="19" cy="53.5" r="1.5" fill="#f0cb90" />
        <circle cx="51" cy="52.5" r="1.5" fill="#eab4b1" />
      </g>
    </svg>
  )
}
