# Reading grade-1 regular-class end times from 15-라 excerpts

Each input file holds short excerpts (lines with times near words like 정규수업, 하교, 교시, 점심, 맞춤형) from one Seoul elementary school's 2026 after-school/care plan (학교알리미 15-라). Each line starts with its original line number `L<n>:`. Your job is to read, for **grade 1 in the 2026 school year, normal semester days (학기 중)**, when regular classes end.

## What to record per school

| field | meaning |
|---|---|
| `p4_end` | end of 4th period ("HH:MM"), only when stated |
| `lunch_start`, `lunch_end` | grade-1 lunch, only when stated (or see rule B) |
| `lunch_position` | `"after_p4"` (lunch after the 4th period, the usual case) or `"before_p4"` (lunch between 3rd and 4th) |
| `p5_end` | end of 5th period, when stated (or see rule B) |
| `doc_periods` | grade-1 periods per weekday Mon..Fri as `[4,5,4,5,5]`, only when the excerpt shows it per weekday; else `null` |
| `basis` | `"stated"` when the times are printed as regular-class times, `"program_start"` when only 맞춤형 start times were used (rule B), `"none"` when nothing usable |
| `confidence` | `"high"`, `"medium"` or `"low"` |
| `lines` | the L numbers you used |
| `evidence` | one short quote (≤150 chars) of the decisive text |

A 4-period day ends when lunch ends if lunch is after the 4th period, otherwise at `p4_end`. A 5-period day ends at `p5_end`.

## Rule A — stated (preferred)

Use printed regular-class times: "정규수업(~12:50)", "09:00~13:40 정규 수업(5교시)", "하교 시간 월,수 12:50 / 화,목,금 13:40", or a 맞춤형 grid row like `13:00~13:40 | 음악놀이 | 정규수업 | 정규수업 | 정규수업 | 보드게임` (on the 정규수업 days that slot IS the 5th period: lunch ends 13:00, p5_end 13:40, and doc_periods = [4,5,5,5,4]).

## Rule B — from 맞춤형 start time (approved 2026-10-21, only when rule A gives nothing)

If the excerpt only gives the grade-1 맞춤형 start times split by day type or weekday (e.g. "월·수 13:00~, 화·목·금 13:50~"): the earlier start is the 4-period-day dismissal (record it as `lunch_end` with `lunch_position` `after_p4`), and `p5_end` = the later start − 10 minutes. Set `basis` to `program_start`, confidence `low`. If the weekday split is clear, fill `doc_periods`.

## Do not

- invent anything; null when not stated. Do not use 2025 tables, grades 3–6 times, 방학/토요/아침 times, or 돌봄 room hours ("정규수업 후 ~ 19:00" tells nothing).
- use a time that is only a 맞춤형/방과후 end time.
- read anything outside the given input file.

## Output

One JSON file (path given in your task): an array with one object per school, in input order:

```json
{"school_id": "B000000000", "p4_end": null, "lunch_start": null, "lunch_end": "12:50", "lunch_position": "after_p4", "p5_end": "13:40", "doc_periods": [4,5,4,5,5], "basis": "stated", "confidence": "high", "lines": [108], "evidence": "정규수업 하교 시간 월,수: 12:50 / 화,목,금: 13:40"}
```
