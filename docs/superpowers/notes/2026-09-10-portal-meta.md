# Meta Careers Portal Probe

Task 9 asked for a Meta careers adapter only if a stable public, unauthenticated JSON endpoint was available from Node `fetch`. I did not find one.

## Probes

- `https://www.metacareers.com/jobs/?q=software%20engineer`
  - Node `fetch` returned `200` with `content-type: text/html`.
- `https://www.metacareers.com/jobs/api/search/?q=software%20engineer`
  - Node `fetch` returned `404` with `content-type: text/html`.
- `https://www.metacareers.com/graphql?variables=%7B%7D`
  - Node `fetch` returned `200` HTML error page: "Sorry, something went wrong".
- `https://www.metacareers.com/api/graphql/`
  - Node `fetch` POST returned `400` with `content-type: text/html`.

The public page references `/api/graphql/` and `/api/graphqlbatch/`, but no stable unauthenticated job-search JSON contract was discoverable without page-specific GraphQL parameters.

## Decision

Do not implement a Meta adapter in this task. Keep Meta disabled as `custom` until there is a stable public JSON endpoint, or until the project explicitly accepts a tokenized GraphQL/page-scraping strategy.
