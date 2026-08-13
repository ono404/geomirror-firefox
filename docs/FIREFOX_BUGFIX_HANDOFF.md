# Firefox maintenance and release handoff

## Current source state — 2026-08-13

- Authoritative Firefox source branch: `main` in `ono404/geomirror-firefox`.
- PR #1 merged the accepted isolated-runtime history at `0657406c1c9f1a8e85111e4a4c1d0cecd678207a` without squashing.
- The implementation acceptance commit `95486617d7c9fd3fc4beb9dd41c517b815bece62` is contained in `main`; `agent/firefox-isolated-runtime` is a completed historical branch.
- Private repository: `https://github.com/ono404/geomirror-firefox.git`.
- `.github/workflows/firefox-ci.yml` runs on pull requests and pushes to `main`; the PR head and merged `main` both passed the Firefox source checks.
- Firefox 153.0.4 independent acceptance: `ACCEPT` with 79 tests, build/lint, extension-off/on controls, Paris/Tokyo regional matrices, and server-observed `Accept-Language` coverage.
- Firefox architecture: one ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`), with no page-visible DOM bridge.
- Accepted limitations: generic JavaScript wrapper source/stack differences and Geolocation `structuredClone` WebIDL internal-slot behavior.
- In this maintenance workspace, historical raw evidence lives outside the Git repository under `../evidence/`; it is not part of a GitHub clone.

## Signed-package state

- Both manifests declare version `1.2.3`.
- Current signed package: `web-ext-artifacts/df5a29cf0eba47f89263-1.2.3.xpi`.
- Signed package SHA-256: `24162a2e7c313aeb0a7d8d1580b7465f6b1d7e90e335de614d31ff30b4444c55`.
- Mozilla accepted and signed this unlisted XPI on 2026-08-13. Its package contains the Firefox isolated runtime accepted on `main`; permanent-profile installation is tracked separately from signing.
- Historical `1.1.0`, `1.2.1`, and `1.2.2` XPI files remain audit artifacts. GitHub source changes do not update an installed add-on; future permanent updates require another version bump, signature, and installation.

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
5. Push a short-lived feature/release branch to `my-private`, open a pull request to `main`, and merge only after Firefox CI passes and the merge is authorized. Signing and publication remain separate authorizations.

GitHub branch protection and rulesets are unavailable for this private repository on the current plan (both APIs returned HTTP 403 on 2026-08-13). The pull-request and CI gate is therefore an operating rule until the repository becomes public or the account is upgraded.

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
