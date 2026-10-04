interface ApartmentIllustrationProps {
  households: number
  /** 사용승인 후 경과 연수. 0 이하이면 연식을 모르는 것으로 본다. */
  age: number
  width?: number
  height?: number
}

type Era = 'new' | 'mid' | 'old' | 'unknown'

// 연식 칩(ApartmentCard의 ageTone)과 같은 색 체계: 신축 초록, 중간 파랑, 구축 분홍.
const PALETTE: Record<Era, { bg: string; line: string; window: string; sun: string }> = {
  new: { bg: '#e6f6ef', line: '#2f8f6a', window: '#bfe5d4', sun: '#d3efe3' },
  mid: { bg: '#e9effb', line: '#3b62b5', window: '#c9d7f2', sun: '#dbe4f7' },
  old: { bg: '#fbecee', line: '#b0475f', window: '#efc9d1', sun: '#f5dce1' },
  unknown: { bg: '#e7f5f2', line: '#5fb3a9', window: '#cfe9e5', sun: '#d6efeb' },
}

// 10년 이하는 높은 탑상형, 11~25년은 중층, 26년 이상은 낮은 판상형. 높이는 76px 기준.
const SHAPE: Record<Era, { width: number; heights: number[] }> = {
  new: { width: 10, heights: [48, 56, 44, 52] },
  mid: { width: 12, heights: [36, 42, 32, 38] },
  old: { width: 13, heights: [22, 26, 20, 24] },
  unknown: { width: 12, heights: [36, 42, 32, 38] },
}

const eraOf = (age: number): Era => age <= 0 ? 'unknown' : age <= 10 ? 'new' : age <= 25 ? 'mid' : 'old'

const buildingCount = (households: number) =>
  households >= 3000 ? 4 : households >= 1000 ? 3 : households >= 300 ? 2 : 1

/** 실제 외관 사진이 아니라 연식과 세대수로 그린 단지 그림. 글자 정보는 카드 본문이 갖는다. */
export default function ApartmentIllustration({ households, age, width = 68, height = 76 }: ApartmentIllustrationProps) {
  const era = eraOf(age)
  const color = PALETTE[era]
  const shape = SHAPE[era]
  const count = buildingCount(households)
  const scale = height / 76
  const base = height - 8
  const gap = 3
  const startX = (width - (count * shape.width + (count - 1) * gap)) / 2
  const rowHeight = era === 'new' ? 5 : 6

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <rect width={width} height={height} fill={color.bg} />
      <circle cx={width - 14} cy={14} r={6} fill={color.sun} />
      {Array.from({ length: count }, (_, index) => {
        const x = startX + index * (shape.width + gap)
        const h = shape.heights[index] * scale
        const top = base - h
        const columns = 2
        const columnWidth = (shape.width - 4) / columns
        const rows: number[] = []
        for (let y = top + 4; y < base - 4; y += rowHeight) rows.push(y)
        return (
          <g key={index}>
            <rect x={x} y={top} width={shape.width} height={h} fill="#fff" stroke={color.line} strokeWidth={1.2} />
            {rows.map((y) => Array.from({ length: columns }, (_, column) => (
              <rect
                key={`${y}-${column}`}
                x={x + 2 + column * columnWidth + 0.8}
                y={y}
                width={columnWidth - 1.6}
                height={2.2}
                fill={color.window}
              />
            )))}
            {era === 'new' ? (
              <path
                d={`M${x - 0.6} ${top} L${x + shape.width / 2} ${top - 5} L${x + shape.width + 0.6} ${top}`}
                fill="#fff"
                stroke={color.line}
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            ) : null}
          </g>
        )
      })}
      <rect x={0} y={base} width={width} height={height - base} fill={color.line} opacity={0.18} />
    </svg>
  )
}
