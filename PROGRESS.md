# GeoMirror Firefox current status

## Active source baseline — 2026-08-12

- Accepted source commit: `95486617d7c9fd3fc4beb9dd41c517b815bece62` on `agent/firefox-isolated-runtime`.
- Independent final acceptance: `ACCEPT`; 79 tests, smoke, syntax, Firefox build/lint, Paris/Tokyo runtime matrix, and reverse validation passed.
- Firefox uses a single ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`); it has no page-visible DOM bridge.
- Closed findings include F011 request-type coverage, font route/token markers, F006 host-language leak, watch-ID shape, Geolocation object shape, and Navigator receiver validation.
- Accepted limitations: generic JavaScript wrapper source/stack differences and Geolocation `structuredClone` WebIDL internal-slot behavior.
- The source is newer than the signed `1.2.2` XPI. Updating a permanent Firefox installation still requires a version bump, Mozilla signing, and installation of a new XPI.
- Draft PR #1 tracks this branch; pushing is not merging, signing, or publishing.
- In this maintenance workspace, historical task evidence remains outside the repository under `../evidence/`; it is not part of the GitHub source checkout. Git history preserves implementation detail.
- Next action: maintenance only, or an explicitly authorized release/signing cycle. Do not continue anti-detect expansion.

## Verification entry point

Run the complete command set in `AGENTS.md`. Firefox runtime acceptance must use ordinary-page and server-side evidence with extension-off/on controls; static tests alone are insufficient.
