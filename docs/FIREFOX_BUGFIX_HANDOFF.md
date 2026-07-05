# Firefox bug-fix handoff

This note is for the next Codex / TRAE session after the Firefox adaptation is already working. It is intentionally short: future agents should verify current Mozilla and project details again before changing code.

## Current state as of 2026-07-05

- Private backup repository: `https://github.com/ono404/geomirror-firefox.git`
- Firefox adaptation commit: `745d239 feat: add Firefox extension build`
- Signed XPI artifact commit: `5c5cf5e chore: add signed Firefox xpi`
- Signed Firefox package: `web-ext-artifacts/df5a29cf0eba47f89263-1.1.0.xpi`
- Chrome / Edge manifest remains `manifest.json`.
- Firefox manifest source is `manifest.firefox.json`; `tools/build-firefox.mjs` writes it to `dist/firefox/manifest.json`.
- `dist/` is ignored build output. Do not commit it unless the project policy changes.

## What to do for a future bug fix

1. Start by checking the real current state:

```bash
git status --short --branch --untracked-files=all
git remote -v
node test/run-tests.js
```

2. Reproduce the bug before changing code. Save the exact Firefox version, switch state, page URL, console output, and verification JSON if available.

3. Fix the smallest root cause. Preserve these boundaries:

- No telemetry.
- No analytics.
- No account system.
- No remote config.
- Do not read page body text, browsing history, cookies, form fields, or user input.
- Do not break Chrome / Edge behavior while fixing Firefox, unless the user explicitly decides to maintain Firefox only.

4. Run the normal local checks:

```bash
node test/run-tests.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
node --check tools/build-firefox.mjs
node --check tools/serve-firefox-verify.mjs
node tools/build-firefox.mjs
web-ext lint --source-dir dist/firefox
```

5. Verify in Firefox with the helper page:

```bash
node tools/serve-firefox-verify.mjs
```

Open the printed `http://127.0.0.1:<port>/` URL in Firefox and confirm the affected surface, plus the main regression surfaces: geolocation, timezone, language, Intl locale, and outgoing `Accept-Language`.

## GitHub vs Firefox package

GitHub stores the source code and backup history. After a bug fix, commit and push the source change:

```bash
git add <changed files>
git commit -m "fix: describe the bug"
git push my-private main
```

That is enough for backup and for another computer to clone the fixed source.

It is not enough to update an already installed permanent Firefox extension. For that, build and sign a new XPI.

## Releasing a new permanent Firefox build

Use this when the user wants the long-term installed Firefox add-on to receive the fix.

1. Bump the extension version, for example from `1.1.0` to `1.1.1`, in both manifests that should represent the release:

- `manifest.json`
- `manifest.firefox.json`

2. Build:

```bash
node tools/build-firefox.mjs
```

3. Sign with Mozilla API credentials from environment variables. Never commit the API key or secret.

```bash
web-ext sign --source-dir dist/firefox --channel unlisted --api-key $env:WEB_EXT_API_KEY --api-secret $env:WEB_EXT_API_SECRET
```

4. Install the newly downloaded `.xpi` in Firefox. For unlisted/self-distributed builds, assume manual installation unless a real update URL/distribution process is added later.

5. If the user wants GitHub to keep the install package too, commit the new `.xpi` under `web-ext-artifacts/` and push it to `my-private`.

## Useful reminders for the next agent

- Temporary Firefox loading uses `dist/firefox/manifest.json` via `about:debugging#/runtime/this-firefox`; it disappears after Firefox restarts.
- Permanent Firefox installation uses the signed `.xpi`.
- If only testing a fix locally, temporary loading is faster and does not require signing.
- If distributing the fix to the user's normal Firefox install, sign a new versioned `.xpi`.
- Do not upload secrets. The signed XPI is okay to store in the private repo; Mozilla API credentials are not.
