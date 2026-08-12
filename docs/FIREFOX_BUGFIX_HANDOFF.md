# Firefox maintenance and release handoff

## Current source state — 2026-08-12

- Accepted source commit: `95486617d7c9fd3fc4beb9dd41c517b815bece62` on `agent/firefox-isolated-runtime`.
- Private repository: `https://github.com/ono404/geomirror-firefox.git`.
- Draft PR #1 targets `main`; a branch push updates the draft but does not merge it.
- Firefox 153.0.4 independent acceptance: `ACCEPT` with 79 tests, build/lint, extension-off/on controls, Paris/Tokyo regional matrices, and server-observed `Accept-Language` coverage.
- Firefox architecture: one ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`), with no page-visible DOM bridge.
- Accepted limitations: generic JavaScript wrapper source/stack differences and Geolocation `structuredClone` WebIDL internal-slot behavior.
- In this maintenance workspace, historical raw evidence lives outside the Git repository under `../evidence/`; it is not part of a GitHub clone.

## Signed-package state

- Both manifests still declare version `1.2.2`; the accepted source fixes do not constitute a new signed release.
- Current signed package: `web-ext-artifacts/df5a29cf0eba47f89263-1.2.2.xpi`.
- Signed package SHA-256: `426f47c8f1ea4e63dc6f0a8e9cb1438d0228985316baae7f75def82d43957179`.
- This unlisted XPI was installed and user-confirmed on 2026-07-16, but it predates the current source branch.
- GitHub source changes do not update an installed add-on. A permanent update requires a version bump, fresh Mozilla signature, and installation of the new XPI.

## Maintenance workflow

1. Inspect the real checkout and reproduce the issue with extension-off/on controls.
2. Preserve the boundaries in `AGENTS.md`; do not expand GeoMirror into a full anti-detect browser.
3. Run the complete check set:

```powershell
node test/run-tests.js
node test/inject-smoke.js
node --check background.js
node --check content-isolated.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
node --check lib/locale.js
node --check lib/timezone.js
node --check lib/font-mask.js
node --check lib/font-mask-isolated.js
node --check tools/build-firefox.mjs
node --check tools/serve-firefox-verify.mjs
node tools/build-firefox.mjs
web-ext.cmd lint --source-dir dist/firefox
git diff --check
```

4. For browser-visible changes, verify Firefox with fresh profiles, ordinary-page probes, server-observed headers, exact source SHA, and owned-process cleanup. Static analysis alone cannot prove runtime behavior.
5. Push the current feature/release branch to `my-private` only when authorized. Merge, signing, and publication are separate authorizations.

## Permanent Firefox release

1. Increase `version` in both source manifests.
2. Build, lint, test, and repeat affected runtime acceptance.
3. Keep Mozilla credentials outside Git and sign from environment variables:

```powershell
web-ext.cmd sign --source-dir dist/firefox --channel unlisted --api-key $env:WEB_EXT_API_KEY --api-secret $env:WEB_EXT_API_SECRET
```

4. Install and manually verify the returned signed XPI.
5. Keep one canonical package under `web-ext-artifacts/`, commit it intentionally, and push the release branch.
6. Merge to `main` only with explicit authorization.

Temporary testing remains available through `about:debugging#/runtime/this-firefox` by selecting `dist/firefox/manifest.json`.
