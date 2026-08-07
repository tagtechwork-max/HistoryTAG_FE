# SuperAdmin navigation performance — Phase 1

Date: 2026-08-06

## Outcome

Production build succeeds and route pages are split behind dynamic imports. The initial HTML no longer preloads chart or FullCalendar vendor chunks.

| Metric | Phase 0 | Phase 1 | Change |
|---|---:|---:|---:|
| Initial JS raw | 2,897.27 KiB | 2,214.53 KiB | -23.57% |
| Initial JS gzip | 818.95 KiB | 643.51 KiB | -21.42% |
| Initial chart preload | 149.12 KiB gzip | 0 | removed |
| Initial FullCalendar preload | 0 | 0 | remains deferred |

`Initial JS` is the module entry plus all `modulepreload` assets emitted by `dist/index.html`. The complete generated artifact list is in `performance-baseline/bundle-baseline.md`.

## Implemented

- All route page components use direct dynamic imports; layouts and providers remain shared.
- One lightweight shared `Suspense` fallback is retained.
- Failed route chunks trigger at most one guarded reload, covering stale tabs after a deployment.
- Google Fonts requests were removed. Be Vietnam Pro weights 400, 500, 600, and 700 are self-hosted using only the Vietnamese subset.
- Chart font configuration now uses the same Be Vietnam Pro family.
- Nginx compresses `application/javascript` and SVG responses.
- Fingerprinted static assets use `public, max-age=31536000, immutable`; `index.html` remains no-store.
- The custom 2 MB chunk warning threshold was removed, so Vite reports oversized chunks again.

## Verification

- `npm run baseline:bundle`: passed (TypeScript and Vite production build).
- `dist/index.html`: only the common vendor chunk is preloaded.
- No Google Fonts URL is emitted by application HTML/CSS.
- Full-repository ESLint is not currently a usable gate: it reports 953 pre-existing findings. Targeted lint found no new issue in `App.tsx`, `main.tsx`, or `lazyWithRetry.ts`.

## Remaining observations

- The common vendor chunk is still 2,166.13 KiB raw / 633.61 KiB gzip, so the final initial-JS target below 500 KiB gzip is not reached yet.
- Vite reports three existing Tailwind-generated invalid `:is()` CSS warnings.
- `hospitalContact.api.tsx` is both statically and dynamically imported, preventing that API module from moving to a separate chunk.
- Authenticated deep-link and navigation smoke tests still require the deployed environment and a SuperAdmin session.
