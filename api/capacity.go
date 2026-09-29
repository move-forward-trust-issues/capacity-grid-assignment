package main

import (
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	dateLayout = "2006-01-02"
	// Two years of history is the stated production ceiling; allow a little slack.
	maxWeeks = 110
)

type capacityPerson struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
	// Allocated[i] is the hours allocated in Weeks[i]. Same length as weeks,
	// zero where the person has no assignments — a dense array per person keeps
	// the payload small (no repeated keys) for thousands of people x ~100 weeks.
	Allocated []float64 `json:"allocated"`
}

type capacityResponse struct {
	// Weeks are the Monday dates (YYYY-MM-DD) of every week in the range.
	Weeks  []string         `json:"weeks"`
	People []capacityPerson `json:"people"`
}

// Allocated hours per (person, week). Weeks run Monday to Sunday, and hours
// only accrue on weekdays: an assignment's hours_per_day applies Mon-Fri, so
// a Mon-Sun assignment is 5 days of work, not 7. Doing the overlap as date
// arithmetic keeps this to one row per (assignment, week) instead of one row
// per day. The weeks CTE is derived from a start date and a count so the
// result does not depend on the session time zone.
const allocatedQuery = `
WITH weeks AS (
  SELECT ($1::date + 7 * i)::date AS week_start
  FROM generate_series(0, $2::int - 1) AS i
)
SELECT a.person_id,
       w.week_start,
       SUM(a.hours_per_day * (LEAST(a.end_date, w.week_start + 4) - GREATEST(a.start_date, w.week_start) + 1))::float8
FROM weeks w
JOIN assignments a
  ON a.start_date <= w.week_start + 4
 AND a.end_date   >= w.week_start
GROUP BY a.person_id, w.week_start`

const peopleQuery = `SELECT id, name, weekly_hours::float8 FROM people ORDER BY name, id`

// mondayOf returns the Monday of the week containing t (weeks start on Monday).
func mondayOf(t time.Time) time.Time {
	return t.AddDate(0, 0, -((int(t.Weekday()) + 6) % 7))
}

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Both dates are inclusive and are snapped outwards to whole Monday-Sunday
// weeks, so any date picked in the UI yields complete weeks. The weeks that
// were actually returned are listed in the response.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, err := time.Parse(dateLayout, q.Get("from"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "from must be a date like 2026-01-05")
		return
	}
	to, err := time.Parse(dateLayout, q.Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "to must be a date like 2026-01-05")
		return
	}
	if to.Before(from) {
		writeError(w, http.StatusBadRequest, "to must not be before from")
		return
	}

	start := mondayOf(from)
	nWeeks := int(mondayOf(to).Sub(start).Hours()/(24*7)) + 1
	if nWeeks > maxWeeks {
		writeError(w, http.StatusBadRequest, "range is too long")
		return
	}

	// One read-only snapshot so people and allocations agree with each other
	// even if a PATCH lands between the two queries.
	ctx := r.Context()
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		log.Printf("capacity: begin: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}
	defer tx.Rollback(ctx)

	resp := capacityResponse{Weeks: make([]string, nWeeks), People: []capacityPerson{}}
	for i := range resp.Weeks {
		resp.Weeks[i] = start.AddDate(0, 0, 7*i).Format(dateLayout)
	}

	rows, err := tx.Query(ctx, peopleQuery)
	if err != nil {
		log.Printf("capacity: people: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}
	index := map[int]int{} // person id -> position in resp.People
	for rows.Next() {
		p := capacityPerson{Allocated: make([]float64, nWeeks)}
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours); err != nil {
			rows.Close()
			log.Printf("capacity: scan person: %v", err)
			writeError(w, http.StatusInternalServerError, "could not load capacity")
			return
		}
		index[p.ID] = len(resp.People)
		resp.People = append(resp.People, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("capacity: people rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	rows, err = tx.Query(ctx, allocatedQuery, start, nWeeks)
	if err != nil {
		log.Printf("capacity: allocations: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}
	for rows.Next() {
		var (
			personID  int
			weekStart time.Time
			hours     float64
		)
		if err := rows.Scan(&personID, &weekStart, &hours); err != nil {
			rows.Close()
			log.Printf("capacity: scan allocation: %v", err)
			writeError(w, http.StatusInternalServerError, "could not load capacity")
			return
		}
		pi, ok := index[personID]
		if !ok {
			continue
		}
		wi := int(weekStart.Sub(start).Hours() / (24 * 7))
		if wi < 0 || wi >= nWeeks {
			continue
		}
		resp.People[pi].Allocated[wi] = hours
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("capacity: allocation rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, resp)
}
