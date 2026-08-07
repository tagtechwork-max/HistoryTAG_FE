# SuperAdmin navigation performance — Phase 6 verification and rollout

Date: 2026-08-06

## Automated release gates

| Gate | Result | Evidence |
|---|---|---|
| Frontend type-check + production build | PASS | `npm run verify:performance-budget` |
| Frontend unit/component tests | PASS | 2 files, 4 tests |
| Initial JS gzip budget | PASS | 658,959 → 659,124 bytes, +165 bytes / +0.03%; CI tolerance 1% |
| Heavy route chunks absent from initial preload | PASS | no `vendor-fullcalendar`, `vendor-charts`, or `vendor-jvectormap` preload |
| Backend dashboard aggregation tests | PASS | `DashboardAggregateServiceTest` |
| Backend collection pagination integration test | PASS | `MaintenanceTaskPagingRepositoryIntegrationTest`, fail-on-collection-pagination enabled |
| Full backend suite | KNOWN FAILURES | 57 tests, 9 pre-existing OT failures; no pagination/aggregate failure |

Machine-readable bundle evidence is stored in `performance-baseline/phase6-bundle-verification.json`. The build gate permits at most 1% gzip variance from the recorded baseline and always fails if a heavy route-only vendor chunk becomes an initial preload.

## Browser and performance acceptance

The authenticated browser scenarios cannot be claimed from automated build output. The in-app browser connection on this workstation was blocked by Windows runtime permissions (`EPERM` while initializing its Node runtime). Run the Phase 0 scenarios in Chrome Incognito, extensions disabled, against staging:

1. Record cold and warm cache independently for the five scenarios in `SUPERADMIN_PERFORMANCE_BASELINE.md`.
2. Perform at least 10 dashboard ↔ heavy-page round trips.
3. Confirm active dashboard requests become canceled after route change and produce no error toast or unhandled rejection.
4. Confirm Network has no dashboard statistics list request with `size=500`.
5. Confirm FullCalendar is requested only after entering a calendar route; chart code is requested only by a route/section that renders charts.
6. Capture the largest long task, Total Blocking Time, click-to-interactive, DOM nodes, listeners, chart instances, and heap after loops 1 and 10.
7. Save sanitized HAR/trace files outside Git and add only numeric results to `performance-baseline/navigation-runs.csv`.
8. Correlate the capture window with backend P95, Hikari active/idle/pending, heap and `HHH90003004` count.

## Staging rollout and rollback

1. Deploy backend first. Keep the legacy list endpoints available.
2. Smoke-test dashboard aggregate endpoints with a SuperAdmin account, then verify a regular account cannot access SuperAdmin endpoints.
3. Deploy frontend and run the browser acceptance list above on a dataset close to production.
4. Monitor frontend errors, aggregate API P95/error rate, backend heap, DB CPU and pool pending connections for one rollout window.
5. Roll back frontend independently if UI metrics regress; the old backend endpoints remain compatible.
6. Roll back backend only after frontend has been rolled back or confirmed not to call the new dashboard endpoints.
7. Remove legacy endpoints only after one stable production rollout and numeric parity confirmation.

Phase 6 is production-complete only after staging/production browser measurements and account smoke tests are attached. Automated gates alone do not authorize deployment or removal of rollback endpoints.
