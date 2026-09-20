# Map Interaction Specification

Status: **Current through v2.2 P3**  
Last updated: 2026-09-17

## Hierarchy

- Wide zoom: regional or district summary markers.
- Intermediate zoom: district or neighborhood summaries.
- Detailed zoom: school markers.
- Selected school: assigned-apartment markers and details.

Administrative counts represent the complete administrative area and are cached independently of viewport visibility. Panning changes which markers are visible, not the meaning of their totals.

## Selection behavior

- A school marker selection preserves center and zoom.
- The selected school uses the highest visual emphasis; nearby schools remain readable.
- Apartment markers use a distinct housing color and display household-aware callouts.
- Selecting an apartment opens its exact detail without discarding school context.

## Bottom sheets

- Support default, middle, and expanded snap positions.
- Content scroll owns upward gestures while expanded.
- A downward gesture transfers to sheet collapse only when content is at its top edge.
- Explicit close remains available; minimize and close are different actions.

## Responsive requirements

- Remove obstructive map controls on mobile.
- Respect safe areas and avoid horizontal overflow at 360 pixels.
- Verify 360, 390, 430, and 1280-pixel widths after interaction changes.
