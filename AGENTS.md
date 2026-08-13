# GeoMirror maintenance guide

## Repository boundaries

- `origin` is the upstream Chrome project (`Azurboy/geomirror`). Treat it as read-only unless the user explicitly asks to contribute upstream.
- `my-private` is the user's Firefox-capable private fork. Normal project pushes go there.
- `main` on `my-private` is the authoritative Firefox source baseline. Work on short-lived branches and merge through a pull request after Firefox CI passes; do not push directly to `main` except for an explicitly authorized emergency.
- After cloning, run `node tools/install-guard.mjs`. This installs the versioned `.githooks/pre-push` guard for this clone only. It reduces accidental direct pushes to `main`; it is not GitHub branch protection and can be bypassed locally with `--no-verify`, an unconfigured clone, hook removal, or the documented emergency environment variable.
- Preserve both browser targets: `manifest.json` is Chrome / Edge MV3; `manifest.firefox.json` is the Firefox manifest source.
- `dist/firefox/` is generated and ignored. Signed XPI files belong in `web-ext-artifacts/`; signing credentials never belong in git.

## Privacy and scope

- The product goal is coherent regional signals, not an undetectable or full anti-detect browser.
- Do not add Canvas randomization, WebGL/GPU or hardware spoofing, multi-account features, or global `Function.prototype.toString` nativization.
- No telemetry, analytics, accounts, remote configuration, or project backend.
- Do not read page text, cookies, credentials, form data, browsing history, or user input.
- The extension only changes documented browser-visible regional signals. Do not claim that it changes the OS, proxy route, DNS, TLS, CLI traffic, or server-side risk controls.

## Required checks

Run from the repository root after source changes:

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
node --check tools/install-guard.mjs
node tools/build-firefox.mjs
web-ext.cmd lint --source-dir dist/firefox
git diff --check
```

On Windows PowerShell, use `web-ext.cmd` if the execution policy blocks the `web-ext.ps1` shim.

For browser behavior changes, also verify the affected surface in Chrome / Edge and Firefox. Use `node tools/serve-firefox-verify.mjs` for geolocation, timezone, locale, and `Accept-Language`; use the current FuckClaude detector for regional-font regressions.

## Firefox release

1. Keep the same release version in `manifest.json` and `manifest.firefox.json`.
2. Build and run all checks above.
3. Sign the generated Firefox package with Mozilla API credentials supplied only through environment variables.
4. Install and manually verify the signed XPI.
5. Store the signed package under `web-ext-artifacts/` and commit source and artifact intentionally.
6. Push the current feature/release branch to `my-private`, open a pull request to `main`, and merge only after Firefox CI passes and the merge is authorized.

Current source, signed-package, and PR states are deliberately separate; see `docs/FIREFOX_BUGFIX_HANDOFF.md`. Architecture details live in `docs/TECHNICAL.md`.
