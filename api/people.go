package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// A person's weekly hours; 0 is allowed (someone on leave / not yet started).
const maxWeeklyHours = 168

type updatePersonRequest struct {
	// A pointer so a missing field is distinguishable from an explicit 0.
	WeeklyHours *float64 `json:"weeklyHours"`
}

type personResponse struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weeklyHours": n}.
//
// It returns the stored person so the client can adopt the server's value
// rather than trust what it sent. Weekly hours is a single number on the
// person (there are no per-week overrides), so a change applies to every
// week, past and future.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid person id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req updatePersonRequest
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "body must be JSON like {\"weeklyHours\": 32}")
		return
	}
	if req.WeeklyHours == nil {
		writeError(w, http.StatusBadRequest, "weeklyHours is required")
		return
	}
	hours := *req.WeeklyHours
	if hours < 0 || hours > maxWeeklyHours {
		writeError(w, http.StatusUnprocessableEntity, "weeklyHours must be between 0 and 168")
		return
	}

	var p personResponse
	err = s.db.QueryRow(r.Context(),
		`UPDATE people SET weekly_hours = $1::float8 WHERE id = $2
		 RETURNING id, name, weekly_hours::float8`, hours, id,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "person not found")
		return
	}
	if err != nil {
		log.Printf("update person %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "could not save weekly hours")
		return
	}
	writeJSON(w, http.StatusOK, p)
}
