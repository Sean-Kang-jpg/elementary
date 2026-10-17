// A per-household parking figure above this is not a car park but a wrong
// household count upstream: 원효산호 (554 households in the 2024-10 base)
// arrived from K-apt 2026-10-02 as 9, so 514 spaces read as 57.1 per
// household. The ETL now keeps the base count on such conflicts; this guard
// covers rows published before that and any source that slips past it.
// Real complexes stay well under it (the highest plausible ones are ~3.5).
export const PARKING_RATIO_MAX = 5

/** The ratio to show, or null when it cannot be a real figure. */
export const plausibleParkingRatio = (value: number): number | null =>
  Number.isFinite(value) && value <= PARKING_RATIO_MAX ? value : null
