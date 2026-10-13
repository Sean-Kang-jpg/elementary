import type { ApartmentEra } from './apartmentVisual'

// Small, cached SVG strings for Naver HTML markers. No images, network, or React
// server renderer; all text/data escaping stays with the marker that owns it.
const wrap = (content: string) => `<span class="map-marker-art" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" focusable="false" aria-hidden="true">${content}</svg></span>`

export const SCHOOL_MARKER_ART = wrap('<ellipse cx="12" cy="21" rx="10" ry="2" fill="#dbe8d8"/><rect x="2" y="12" width="6" height="8" rx="1.5" fill="#c5d6e8"/><rect x="16" y="12" width="6" height="8" rx="1.5" fill="#c5d6e8"/><rect x="7" y="8" width="10" height="13" rx="2" fill="#aac5dd"/><path d="M5 9 12 3l7 6Z" fill="#ccab79"/><circle cx="12" cy="9" r="2" fill="#fffaf0"/><path d="M12 8v1l1 1" fill="none" stroke="#687f96" stroke-width=".8"/><path d="M4 15h2m12 0h2M4 18h2m12 0h2" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/><rect x="10" y="15" width="4" height="6" rx="1.5" fill="#7595b2"/>')

const APARTMENT_TONES: Record<ApartmentEra, [string, string]> = {
  new: ['#c5d6e8', '#849fb9'], mid: ['#b6dbca', '#75a98f'],
  old: ['#ead0a5', '#bb9866'], unknown: ['#d3dade', '#94a5ae'],
}
const APARTMENT_ART = Object.fromEntries(Object.entries(APARTMENT_TONES).map(([era, [front, side]]) => [era,
  wrap(`<ellipse cx="12" cy="21" rx="10" ry="2" fill="#dbe8d8"/><rect x="3" y="10" width="7" height="11" rx="1.5" fill="${front}"/><rect x="11" y="5" width="8" height="16" rx="1.5" fill="${front}"/><path d="M10 6l2-2h8l-2 2M18 6l2-2v15l-2 2M9 11l2-2v10l-2 2" fill="${side}"/><path d="M5 13h2m-2 4h2m6-8h3m-3 4h3m-3 4h3" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/><circle cx="3" cy="19" r="2" fill="#91bf9e"/>`)
])) as Record<ApartmentEra, string>

export const apartmentMarkerArt = (era: ApartmentEra): string => APARTMENT_ART[era]
export const CARE_MARKER_ART = wrap('<rect x="4" y="9" width="16" height="12" rx="3" fill="#ecc4bb"/><path d="M2 10 12 3l10 7Z" fill="#cc9c83"/><path d="M12 17c-5-3-5-6-2-6 1 0 2 1 2 1s1-1 2-1c3 0 3 3-2 6Z" fill="#fffaf0"/><ellipse cx="12" cy="22" rx="9" ry="1" fill="#dbe8d8"/>')
export const ACTIVITY_MARKER_ART = wrap('<path d="M3 6c3-1 6 0 9 2 3-2 6-3 9-2v14c-3-1-6 0-9 2-3-2-6-3-9-2Z" fill="#fff6df" stroke="#d8bd8d" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 8v13M5 10l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1" stroke="#af9569" stroke-width="1.2" stroke-linecap="round"/>')
