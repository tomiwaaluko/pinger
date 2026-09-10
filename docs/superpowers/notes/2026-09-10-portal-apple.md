# Apple Careers Portal Probe

Task 9 asked for an Apple careers adapter only if a stable public, unauthenticated JSON endpoint was available from Node `fetch`. I did not find one.

## Probes

- `https://jobs.apple.com/en-us/search?search=software%20engineer&location=united-states-USA`
  - Node `fetch` returned `200` with `content-type: text/html`.
- `https://jobs.apple.com/api/role/search?search=software%20engineer&location=united-states-USA`
  - Node `fetch` returned `404` with `content-type: text/html`.
- `https://jobs.apple.com/api/v1/search?search=software%20engineer&location=united-states-USA`
  - Node `fetch` GET returned `401` with `content-type: text/html` and body "User Unauthorized".
- `https://jobs.apple.com/static/jobsite.main.1a0b9f83aae9706cfb2c.js`
  - Node `fetch` returned `200` JavaScript. The bundle references `/api/v1/search`, `/api/v1/CSRFToken`, `/api/role/autocomplete/<searchTerm>`, and app-scoped `/app/api/v1/...` paths.
- `https://jobs.apple.com/api/v1/CSRFToken`
  - Node `fetch` returned `200` with an empty body.
- `https://jobs.apple.com/api/v1/search`
  - Node `fetch` POST returned `436` with `content-type: application/json` and an `error` payload.

The public app has JSON routes, but search is gated by app/session/CSRF behavior and is not a stable public unauthenticated JSON API for this watcher.

## Decision

Do not implement an Apple adapter in this task. Keep Apple disabled as `custom` until Apple exposes a stable public JSON endpoint, or until the project explicitly accepts app-session emulation.
