package main

import "net/http"

// writeError sends a JSON error body so the client can show a real message
// instead of scraping text/plain out of http.Error.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
