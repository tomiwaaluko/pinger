# Microsoft Careers Portal Probe

Task 9 asked for a Microsoft careers adapter only if a stable public, unauthenticated JSON endpoint was available from Node `fetch`. I did not find one that is usable by this watcher.

## Probes

- `https://gcsservices.careers.microsoft.com/search/api/v1/search?lc=United%20States&l=en_us&pg=1&pgSz=5&o=Relevance&flt=true`
  - Node `fetch` failed before HTTP with `ERR_TLS_CERT_ALTNAME_INVALID`; the certificate presented `DNS:*.azureedge.net`, not `gcsservices.careers.microsoft.com`.
- `https://gcsservices.careers.microsoft.com/search/api/v1/search?lc=United%20States&l=en_us&pg=1&pgSz=5&o=Relevance&flt=true&q=software%20engineer`
  - Same Node TLS hostname failure.
- `https://gcsservices.careers.microsoft.com/search/api/v1/job/1770809?lang=en_us`
  - Same Node TLS hostname failure.
- `https://jobs.careers.microsoft.com/global/en/search?q=software%20engineer&lc=United%20States`
  - Node `fetch` returned `200` with `content-type: text/html`.
- `https://jobs.careers.microsoft.com/api/application/v2/location/options?domain=microsoft.com&user_mode=logged_in_candidate&country=United%20States`
  - Node `fetch` returned `200` with `content-type: text/html`, not JSON.
- `https://jobs.careers.microsoft.com/api/apply/v2/jobs?domain=microsoft.com&query=software%20engineer`
  - Node `fetch` returned `200` with `content-type: text/html`, not JSON.

The public site appears to be an Eightfold-backed application, but the known JSON host is not usable with normal Node TLS verification.

## Decision

Do not implement a Microsoft adapter in this task. Keep Microsoft disabled as `custom` until Microsoft exposes a Node-usable public JSON endpoint with a valid certificate, or until the project explicitly accepts a different transport/proxy strategy.
