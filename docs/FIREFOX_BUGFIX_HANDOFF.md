# Firefox maintenance and release handoff

## Current source state — 2026-07-16

- Extension version: `1.2.2` in both source manifests.
- Source status: upgraded in the current working tree; commit, push, Mozilla
  signing, and signed-XPI installation are still pending.
- Private repository: `https://github.com/ono404/geomirror-firefox.git`.
- Current source commit on `my-private/main`: `a4c40de fix: mask all FuckClaude Chinese font probes`.
- Latest canonical signed Firefox package remains the historical `1.2.1`
  artifact: `web-ext-artifacts/df5a29cf0eba47f89263-1.2.1.xpi`. It does not
  contain the `1.2.2` source changes.
- Chrome / Edge manifest: `manifest.json`.
- Firefox manifest source: `manifest.firefox.json`; build output: `dist/firefox/manifest.json`.
- `dist/` is generated and ignored.
- Regional font masking was manually confirmed against `LinXiaoTao/FuckClaude` after expanding the blocked-family list to all detector probes.

The signed `1.2.1` unlisted XPI remains suitable for its existing installation,
but it does not include this upgrade. Source changes on GitHub do not update an
installed add-on. Installing `1.2.2` permanently requires a fresh Mozilla
signature and installation of the newly signed XPI unless an explicit
update-distribution mechanism is added later.

## Maintenance workflow

1. Inspect and test the actual checkout:

```powershell
git status --short --branch --untracked-files=all
git remote -v
node test/run-tests.js
node test/inject-smoke.js
```

2. Reproduce the issue before changing code. Record the browser version, page or detector, switch state, and observed output.

3. Preserve the project boundaries in `AGENTS.md`, including both browser manifests and the privacy red lines.

4. Run the complete check set:

```powershell
node test/run-tests.js
node test/inject-smoke.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
node --check tools/build-firefox.mjs
node --check tools/serve-firefox-verify.mjs
node tools/build-firefox.mjs
web-ext.cmd lint --source-dir dist/firefox
```

PowerShell may block the `web-ext.ps1` shim; `web-ext.cmd` is the supported local workaround.

5. Verify the affected behavior in the browser. For general Firefox checks, run `node tools/serve-firefox-verify.mjs` and open its printed local URL. For font-mask changes, test the current FuckClaude detector as well as a normal page that uses non-Chinese fonts.

## Permanent Firefox release

1. Increase `version` in both `manifest.json` and `manifest.firefox.json`.
2. Build and pass the checks above.
3. Keep Mozilla credentials outside the repository and sign from environment variables:

```powershell
web-ext.cmd sign --source-dir dist/firefox --channel unlisted --api-key $env:WEB_EXT_API_KEY --api-secret $env:WEB_EXT_API_SECRET
```

4. Install and manually verify the returned signed XPI.
5. Keep one canonical copy under `web-ext-artifacts/`.
6. Commit the source and intended release artifact, then push to the private fork when authorized:

```powershell
git push my-private main
```

Temporary Firefox loading remains available through `about:debugging#/runtime/this-firefox` by selecting `dist/firefox/manifest.json`; temporary installations disappear after restart.