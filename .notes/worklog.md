# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

- **Seed shape.** Every logical assignment is stored as 15 rows that sum to 2/4/6/8 h/day (8,413 groups × 15). They are stacked allocations, not duplicates — summing is right, de-duplicating would cut hours 15×. Person 4 has a 5h group (two overlapping assignments), which is the intended "over" case.
- **Weekdays only.** ~37% of assignments end on a Sat/Sun and several span two weeks (Fri→Mon). `hours_per_day` is applied Mon–Fri only, otherwise a Mon–Sun 8h/day assignment reads as 56h (140%) instead of 40h (100%). Verified in psql against people 1–5: 40, 32+8, 4+12, 45+40, 20.
- **Weeks are Monday–Sunday**, and `from`/`to` are snapped outwards to whole weeks in the API; the response lists the weeks it returned. Dates are plain `YYYY-MM-DD` strings, arithmetic in UTC (client) / `$1::date + 7*i` (SQL) so the time zone can't move a day.
- **Query.** One row per (assignment, week) via date arithmetic — no per-day `generate_series`. Whole 2-year range × 500 people ≈ 130 ms, 312 KB JSON; the 3-week default is ~5 ms and uses the (start_date, end_date) index. People + allocations are read in one REPEATABLE READ read-only tx.
- **Payload.** One dense `allocated[]` per person aligned to `weeks[]`, plus a single `weeklyHours`. Capacity is a per-person constant today (schema has no per-week capacity, holidays or time off); if that changes the shape needs `capacity[]` too.
- **Capacity 0** (Eli, person 5) with 20h allocated: treated as over (no percentage shown, no divide by zero).
- **Edit flow.** Optimistic override layered over fetched data (so a read landing mid-save can't flicker it back); server response replaces it; failure drops the override, shows a notice with Retry. After success the range is refetched in the background (aborting any older in-flight read). Editing hours changes capacity for *all* weeks — there is only one number per person.
- **Only the latest request may write state** (abort + `signal.aborted` check) — covered by a test with a late response.
- **Rows are windowed** (fixed 44px rows); columns are not. Fine for ≤104 weeks; the header/summary counts are computed over all people, not just visible ones.
- **Native form validation turned off** on the inline editor (`noValidate`): with `max=168` the browser blocked submit before my own message could show. Caught by the "invalid hours" test.
- **Verification.** SQL was first checked against a real Postgres loaded with the real seed. The Go handlers were then run against the real pgx locally, and the UI was checked by hand in the browser (see the last entry).
- **Not done:** per-week capacity/holidays; team/filter/pagination server-side (3k people × 104 weeks ≈ 2 MB JSON); optimistic concurrency on PATCH (last write wins); URL-synced range; keyboard grid navigation; column virtualization; Go tests in-repo; end-to-end test.
- Ran it locally (Go 1.26, local Postgres and Node). I tested the default range, week navigation, a ~7-month range, editing, invalid input and a failed save with the API stopped. `npm test`: 17 passing; `go vet` clean.