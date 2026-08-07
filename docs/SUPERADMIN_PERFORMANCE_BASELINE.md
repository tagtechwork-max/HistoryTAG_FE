# SuperAdmin performance baseline runbook

This runbook makes the Phase 0 measurement repeatable. Keep the same machine, Chrome version, backend environment, account, and database snapshot for every before/after comparison.

## 1. Record the environment

Copy `performance-baseline/environment.example.md` to `performance-baseline/environment.md` and fill every field. Do not commit credentials, tokens, HAR files, or Performance traces.

Use Chrome Incognito with extensions disabled. In DevTools Network, verify there are no `chrome-extension://` requests. Measure cold cache and warm cache as separate runs.

## 2. Capture the production bundle

```bash
npm run baseline:bundle
```

The command performs a production build and writes:

- `performance-baseline/bundle-baseline.json` for machine comparison;
- `performance-baseline/bundle-baseline.md` for review;
- raw and gzip size for every JS/CSS asset;
- every module preload emitted by `dist/index.html`.

The generated JSON also separates JS/CSS totals and records the raw/gzip total of the module entry plus module-preloaded JavaScript, which is the comparable initial-load bundle metric for later phases.

## 3. Capture navigation scenarios

Open `/superadmin/home`, then record these scenarios at least five times each:

1. Click another menu item 1.5 seconds after dashboard navigation.
2. Click another menu item after 2.7 seconds.
3. Click another menu item after 6.2 seconds.
4. Scroll near the CSKH report and navigate immediately.
5. Scroll near the hardware report and navigate immediately.

For each run:

1. Start a Chrome Performance recording before opening the dashboard.
2. Keep recording until the destination route is interactive.
3. Save the Performance trace and an application-domain-only HAR locally.
4. Add one row to `performance-baseline/navigation-runs.csv`.
5. Record long tasks over 50 ms, the largest long task, Total Blocking Time, click-to-interactive duration, request count, transferred bytes, and `size=500` request count.

Name artifacts with the cache mode, scenario, and run number, for example `cold-2.7s-run-03.trace.json.gz`. HAR and trace artifacts are ignored by Git because they may contain sensitive headers and application data.

Before exporting a HAR, use Chrome's sanitized export option when available. Never commit a capture or copy authentication headers into the CSV.

## 4. Capture backend evidence

For the exact wall-clock window of every frontend run, record:

- `HHH90003004` count;
- slow/query timings relevant to dashboard requests;
- connection-pool active, idle, and pending values;
- backend version/commit and database snapshot identifier.

## 5. Phase 0 completion gate

Phase 0 is complete only when at least one trace reproduces the lag, its dominant long task is attributed to the app/chart/JSON/extension, and the CSV contains a comparable baseline for all scenarios. Do not average cold and warm cache runs together.
