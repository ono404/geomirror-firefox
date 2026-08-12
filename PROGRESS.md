# GeoMirror Firefox current status

## Formal Firefox baseline — 2026-08-13

- `main` in `ono404/geomirror-firefox` is the authoritative Firefox source baseline.
- PR #1 was merged without squashing at `0657406c1c9f1a8e85111e4a4c1d0cecd678207a`; it contains the accepted isolated-runtime implementation and its audited history.
- The implementation acceptance commit `95486617d7c9fd3fc4beb9dd41c517b815bece62` is now part of `main`; `agent/firefox-isolated-runtime` is historical, not a newer release lane.
- Independent final acceptance: `ACCEPT`; 79 tests, smoke, syntax, Firefox build/lint, Paris/Tokyo runtime matrix, and reverse validation passed.
- `.github/workflows/firefox-ci.yml` runs on pull requests and pushes to `main`. The merge commit passed tests, smoke, syntax, build, and Firefox package-shape checks.
- Firefox uses a single ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`); it has no page-visible DOM bridge.
- Closed findings include F011 request-type coverage, font route/token markers, F006 host-language leak, watch-ID shape, Geolocation object shape, and Navigator receiver validation.
- Accepted limitations: generic JavaScript wrapper source/stack differences and Geolocation `structuredClone` WebIDL internal-slot behavior.
- The source is newer than the signed `1.2.2` XPI. Updating a permanent Firefox installation still requires a version bump, Mozilla signing, and installation of a new XPI.
- In this maintenance workspace, historical task evidence remains outside the repository under `../evidence/`; it is not part of the GitHub source checkout. Git history preserves implementation detail.
- Next action: maintenance through a short-lived branch and CI-gated pull request, or an explicitly authorized release/signing cycle. Do not continue anti-detect expansion.

## Verification entry point

Run the complete command set in `AGENTS.md`. Firefox runtime acceptance must use ordinary-page and server-side evidence with extension-off/on controls; static tests alone are insufficient.
