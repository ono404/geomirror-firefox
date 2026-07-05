# TRAE Task 01: Firefox baseline package and loadability

## Goal

Make the existing GeoMirror extension produce a Firefox-loadable development package without breaking the current Chrome / Edge extension.

This is the first Firefox adaptation slice. Do not try to finish every runtime behavior in this task. The target is:

- Chrome / Edge `manifest.json` keeps working.
- A Firefox-specific package can be built or prepared locally.
- Firefox can load the prepared package as a temporary extension.
- Existing tests still pass, and new tests protect the Firefox manifest shape.

## Current project state

Project path:

```text
D:\LAB\火狐浏览器插件制作\geomirror
```

Current branch state before this task:

```text
## main...origin/main
 M lib/providers.js
?? docs/FIREFOX_HANDOFF.md
?? docs/TRAE_TASK_01_FIREFOX_BASELINE.md
```

Important: do not revert or overwrite the existing local change in `lib/providers.js`. That change makes IP provider selection prefer results with IANA timezone while keeping a no-timezone fallback.

Baseline verification already passed before this task:

```bash
node test/run-tests.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
```

## Firefox platform facts to account for

Use official Mozilla docs as the source of truth:

- Firefox MV3 is generally available from Firefox 109:
  https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
- Firefox does not currently use MV3 extension `background.service_worker`; it uses `background.scripts` / event pages. Cross-browser manifests may include both, but the current Chrome manifest declares `minimum_chrome_version: "111"`, and Chrome before 121 may reject MV3 manifests containing `background.scripts`. Therefore, use a Firefox-specific manifest/package instead of adding `scripts` directly to the Chrome manifest.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- Firefox supports `content_scripts.world: "MAIN"` and `"ISOLATED"`. The existing two-content-script architecture should be preserved.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts
- Firefox DNR `modifyHeaders` rules require host permissions for the request URL, and for non-navigation requests also the initiator. To make outgoing `Accept-Language` spoofing work broadly, the Firefox manifest probably needs `<all_urls>` host permission, not only provider host permissions.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
- Firefox still supports blocking `webRequest`, but do not switch to `webRequest` in this task unless Firefox DNR is proven impossible by a concrete load/runtime error. DNR is the smaller first step and keeps the implementation closer to Chrome.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeSendHeaders

## Required implementation

1. Keep the existing `manifest.json` as the Chrome / Edge manifest.

Do not add Firefox-only `background.scripts` directly to `manifest.json`.

2. Add a Firefox-specific manifest source.

Recommended file:

```text
manifest.firefox.json
```

It should preserve the extension name, version, description, popup, icons, provider host permissions, content script order, `world`, `run_at`, and `all_frames` behavior.

Firefox-specific requirements:

- Use `background.scripts`.
- Ensure background scripts load library files before `background.js`, for example:

```json
"background": {
  "scripts": [
    "lib/geo.js",
    "lib/providers.js",
    "lib/locale.js",
    "background.js"
  ]
}
```

- Keep permissions needed by current code: `storage`, `alarms`, `declarativeNetRequest`.
- Include provider host permissions already present in Chrome manifest.
- Add `<all_urls>` to Firefox `host_permissions` if needed for DNR `modifyHeaders` and global content-script behavior. Document this permission clearly in README / privacy text.

3. Make `background.js` compatible with both worker and event-page loading.

Current top-level code calls:

```js
importScripts('lib/geo.js', 'lib/providers.js', 'lib/locale.js');
```

That is correct in Chrome MV3 service workers, but Firefox `background.scripts` run in a background page/event page where `importScripts` may not exist. Make the smallest safe change, such as guarding the call:

```js
if (typeof importScripts === 'function') {
  importScripts('lib/geo.js', 'lib/providers.js', 'lib/locale.js');
}
```

Do not refactor the background flow in this task.

4. Add a small standard-Node build/prep script for Firefox.

Recommended file:

```text
tools/build-firefox.mjs
```

Expected behavior:

- Create or refresh `dist/firefox`.
- Copy required extension files into `dist/firefox`.
- Copy `manifest.firefox.json` to `dist/firefox/manifest.json`.
- Copy at least:
  - `background.js`
  - `content-bridge.js`
  - `content-inject.js`
  - `popup.html`
  - `popup.css`
  - `popup.js`
  - `PRIVACY.md`
  - `README.md`
  - `lib/`
  - `icons/`
- Do not copy `.git`, tests, docs, or source-control metadata into the package.
- Use only Node built-in modules. Do not add a dependency just for copying files.

5. Add `.gitignore` if needed.

At minimum ignore:

```text
dist/
node_modules/
```

Do not ignore source files or docs.

6. Add tests for the Firefox package shape.

Update `test/run-tests.js` or add another simple Node test if cleaner.

The tests should check:

- Chrome `manifest.json` still uses `background.service_worker`.
- Chrome content script order still has `lib/timezone.js` before `content-inject.js` in the MAIN world.
- Firefox manifest exists.
- Firefox manifest uses `background.scripts`.
- Firefox background script order loads `lib/geo.js`, `lib/providers.js`, `lib/locale.js` before `background.js`.
- Firefox content scripts preserve MAIN / ISOLATED worlds and order.
- Firefox manifest includes the permissions needed for current behavior.

7. Update docs.

Update README and/or technical docs with a short Firefox development section:

- How to build the Firefox package, for example:

```bash
node tools/build-firefox.mjs
```

- How to load it manually:
  - Open Firefox.
  - Go to `about:debugging#/runtime/this-firefox`.
  - Click "Load Temporary Add-on".
  - Choose `dist/firefox/manifest.json`.
- Explain why Firefox requests broad site access: the extension must patch page-visible geolocation/timezone/language APIs on normal pages and must set outgoing `Accept-Language` consistently.
- Keep the privacy boundary unchanged.

## Hard constraints

- Do not add telemetry.
- Do not add analytics.
- Do not add an account system.
- Do not add remote config.
- Do not collect page body text, browsing history, form contents, or user input.
- Do not remove existing provider endpoints.
- Do not break Chrome / Edge behavior.
- Do not revert the existing local `lib/providers.js` change.
- Do not switch the whole project to a new framework or bundler.
- Do not add npm dependencies unless there is a concrete reason and you explain it.

## Validation to run before handing back

Run these from the project root:

```bash
node test/run-tests.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
node --check tools/build-firefox.mjs
node tools/build-firefox.mjs
```

If `web-ext` is available, also run:

```bash
web-ext lint --source-dir dist/firefox
```

If `web-ext` is not available, say so clearly. Do not install it automatically unless the user or Codex explicitly approves.

Then try to load `dist/firefox/manifest.json` in Firefox as a temporary add-on. If Firefox refuses to load it, stop and report:

- Exact Firefox error text.
- Which file and manifest key caused it, if known.
- Smallest proposed fix.

## What to report back

When finished, report:

- Files changed.
- Why each file changed.
- Validation commands run and their results.
- Whether Firefox temporary loading succeeded.
- Any remaining Firefox-specific risks found.
