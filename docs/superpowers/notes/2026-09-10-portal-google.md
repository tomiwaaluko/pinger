# Google Careers Portal Probe

Task 9 asked for a Google careers adapter only if a stable public, unauthenticated JSON endpoint was available from Node `fetch`. I did not find one.

## Probes

- `https://careers.google.com/api/v3/search/?q=software%20engineer`
  - Node `fetch` returned `404` with `content-type: application/json` and body `{"detail":"Not Found"}`.
- `https://careers.google.com/api/v3/search/?distance=50&q=software%20engineer`
  - Node `fetch` returned the same JSON `404`.
- `https://careers.google.com/jobs/results/?q=software%20engineer`
  - Node `fetch` returned `200` HTML, not JSON.
- `https://www.google.com/about/careers/applications/jobs/results/?q=software%20engineer`
  - Node `fetch` returned `200` HTML, not JSON.
- `https://www.google.com/about/careers/applications/jobs/results?location=United%20States&q=software%20engineer`
  - Node `fetch` returned `200` HTML, not JSON.

The HTML payload contains `AF_initDataCallback` blocks, but no discoverable `/api/v*` endpoint and no `batchexecute` job-search RPC reference. Parsing those embedded blocks would be HTML scraping, not a stable public JSON API.

## Decision

Do not implement a Google adapter in this task. Keep Google disabled and leave the portal stub returning `[]` until there is a public unauthenticated JSON endpoint, or until the project explicitly accepts an HTML scraper with the associated maintenance and policy risk.

