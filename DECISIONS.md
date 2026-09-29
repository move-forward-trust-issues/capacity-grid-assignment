# Decisions

## What did the spec not tell you?

- **What counts as a week.** I went with Monday-Sunday weeks and only count hours on weekdays. Over a third of the assignments finish on a weekend, and quite a few cross from one week into the next (for example, Fri to Mon). If I counted all 7 days, a normal Mon-Sun assignment at 8h /day would show 56h (140 %) instead of 40h.

- **Rows that look like duplicates.** Each assignment is actually stored as 15 rows with the same person, project and dates, adding up to 2/4/6/8 hours per day. I treated these as separate allocations and added them together. Removing them as duplicates would have meant losing most of the allocated hours

- **Changing weekly hours.** There is only one `weekly_hours` value per person, so changing it affects both previous and future weeks. I didn't introduce a separate capacity for each week because that would require a different data model.

- **Date ranges.** The API rounds `from` and `to` to full weeks and returns the weeks it actually used. I limited the range to roughly 2 years, which seemed consistent with the brief.

- **Edit flow.** I went with an optimistic update. The new value and the over-allocation counters change immediately, then the server response replaces the local value. If the request fails, I roll it back and show a notice with a Retry option. After a successful update I also refresh the range in the background, so changes made elsewhere are picked up. I preferred this over waiting for a full refetch because changing a value in the grid feels faster this way, while the background refresh still keeps the data in sync.

## What did you notice that looked wrong?

- Eli Nakamura has 0h capacity but 20h allocated. I show this as +20h over-allocated and make sure there is no division by zero.

- The over-allocation is quite uneven. Some weeks have around 40-56 people over their capacity, while others have almost none. For example, the week of 12 Jan has 0 people over-allocated. Most assignments also seem to start in roughly one week out of three. This matches how the seed is generated rather than being a query issue.

- Part-time people can turn red very easily. For example, someone with 24h capacity can have 40h allocated. `hours_per_day` is an absolute value (8h × 5), rather than being scaled according to their working hours. I kept this behaviour because that's what the data currently represents.

- A lot of the grid is empty — roughly two thirds of the cells. This means a manager has to scroll quite a bit to find the red cells. I didn't add a filter for this in the current version because it wasn't part of the original requirements

## What did the AI get wrong that you caught?

- The first version of the inline hours editor used `<input type="number" min="0" max="168">` inside a form. With the browser's native validation enabled, submitting a value such as 200 was blocked by the browser before the form's `onSubmit` handler ran. This meant the app's own message, "Hours must be between 0 and 168.", was never shown, and the exact browser message could also differ between browsers. A component test that entered 200 exposed the problem.

- I fixed this by adding `noValidate` to the form. The `min` and `max` attributes are still there as hints for the input, but the actual validation is handled by a single `validateWeeklyHours` function, which is unit tested. The API also validates the value again and returns a 422 if it is invalid.

## What would you do differently with a week?

- Add a filter/sort option for over-allocated people and move to server-side pagination. With a few thousand people over two years the response would be around 2MB, and even 500 rows means a lot of scrolling.

- Support capacity on a per-week basis, so things like holidays, time off or a reduced week around New Year's can be represented properly.

- Add concurrency control to the PATCH endpoint. At the moment it is basically last-write-wins, so two edits made at almost the same time could overwrite each other.

- Put the selected date range in the URL, add keyboard navigation to the grid, and use column virtualisation when displaying longer ranges.

- Add a Go test suite against a real Postgres database and an end-to-end test for the edit flow. The current tests cover the edit/rollback path, stale responses, and the week/status logic.