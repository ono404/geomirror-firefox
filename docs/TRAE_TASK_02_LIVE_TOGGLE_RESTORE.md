# TRAE Task 02: Fix live toggle rollback on already-open pages

## Goal

Fix GeoMirror Firefox/Chrome behavior when the user turns spoofing switches off while a page is already open.

Firefox baseline is now successful:

- Firefox temporary add-on loads.
- Popup opens and shows Active.
- Refresh detects the exit IP.
- On a fresh page with all switches on, geolocation, timezone, locale, and `Accept-Language` match the popup.
- After switches are off and the page is refreshed, timezone, language, and `Accept-Language` return to the real browser values.

Remaining issue: on an already-open page, turning switches off can leave some patched JavaScript APIs stuck until the page is refreshed.

## Evidence

Verification page:

```bash
node tools/serve-firefox-verify.mjs
```

URL:

```text
http://127.0.0.1:8765/
```

With all switches enabled, observed output:

```json
{
  "geolocationPermission": "granted",
  "geolocation": {
    "latitude": 43.035033480289506,
    "longitude": -76.17127022240754
  },
  "timezone": {
    "intlTimeZone": "America/New_York",
    "offsetNow": 240,
    "offsetWinterNY": 300,
    "offsetSummerNY": 240
  },
  "language": {
    "navigatorLanguage": "en-US",
    "navigatorLanguages": ["en-US", "en"],
    "dateTimeFormatLocale": "en-US",
    "numberFormatLocale": "en-US",
    "collatorLocale": "en-US",
    "acceptLanguageHeaderSeenByLocalServer": "en-US,en;q=0.9"
  }
}
```

After switches are off and the page is refreshed, observed output:

```json
{
  "geolocation": {
    "latitude": 34.769,
    "longitude": 113.6879,
    "accuracy": 2000
  },
  "timezone": {
    "intlTimeZone": "Asia/Shanghai",
    "offsetNow": -480,
    "offsetWinterNY": -480,
    "offsetSummerNY": -480
  },
  "language": {
    "navigatorLanguage": "zh-CN",
    "navigatorLanguages": ["zh-CN", "zh", "zh-TW", "zh-HK", "en-US", "en"],
    "dateTimeFormatLocale": "zh-Hans-CN",
    "numberFormatLocale": "zh-Hans-CN",
    "collatorLocale": "zh-Hans-CN",
    "acceptLanguageHeaderSeenByLocalServer": "zh-CN,zh;q=0.9,zh-TW;q=0.8,zh-HK;q=0.7,en-US;q=0.6,en;q=0.5"
  }
}
```

Earlier, without page refresh after switching off, `Date.prototype.getTimezoneOffset()` and language surfaces could remain spoofed. That is the bug to fix.

## Suspected cause

`content-inject.js` captures the original constructors/functions, then overwrites browser-visible APIs:

- `Date.prototype.getTimezoneOffset`
- `Intl.DateTimeFormat`
- `Intl.NumberFormat`
- `Intl.Collator`
- `navigator.language`
- `navigator.languages`
- `navigator.permissions.query`

When settings later change through `chrome.storage.onChanged` -> DOM attribute mutation -> `applyAll()`, the code applies active spoofing but does not fully restore original descriptors/functions when spoofing becomes inactive.

Also check `navigator.permissions.query`: it currently appears to return `{ state: "granted" }` for geolocation regardless of whether location spoofing is enabled. When location spoofing is off, it should delegate to the real permissions API.

## Required behavior

On an already-open page:

1. With all spoof switches on:
   - Geolocation returns the override coordinate.
   - `navigator.permissions.query({ name: "geolocation" })` returns spoofed granted.
   - `Date.prototype.getTimezoneOffset()` returns the spoofed IANA timezone offset and remains DST-aware.
   - `Intl.DateTimeFormat().resolvedOptions().timeZone` returns the spoofed IANA timezone.
   - `navigator.language`, `navigator.languages`, and default Intl locale constructors return the spoofed locale.
   - `Accept-Language` header is spoofed.

2. After turning `Location spoof` off without refreshing the page:
   - `navigator.geolocation.getCurrentPosition` delegates to the real browser geolocation.
   - `navigator.permissions.query({ name: "geolocation" })` delegates to the real browser permissions API.

3. After turning `Timezone spoof` off without refreshing the page:
   - `Date.prototype.getTimezoneOffset()` returns the real browser value.
   - `Intl.DateTimeFormat().resolvedOptions().timeZone` returns the real browser timezone.

4. After turning `Language spoof` off without refreshing the page:
   - `navigator.language` and `navigator.languages` return real browser values.
   - `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.Collator` default locales return real browser values.
   - Outgoing `Accept-Language` header returns to the real browser header.

5. Turning switches back on again on the same page should reapply spoofing without stacking wrappers.

## Implementation guidance

Keep the fix narrow and focused in `content-inject.js`.

Recommended approach:

- Capture original property descriptors/functions at startup before patching:
  - `Date.prototype.getTimezoneOffset`
  - `Intl.DateTimeFormat`
  - `Intl.NumberFormat`
  - `Intl.Collator`
  - `navigator.language`
  - `navigator.languages`
  - `navigator.geolocation`
  - `navigator.permissions.query`
- Add explicit restore helpers that put original functions/descriptors back when a spoof surface is inactive.
- Ensure `applyAll()` handles both directions:
  - inactive -> active
  - active -> inactive
  - active -> active after updated override data
- Avoid wrapper stacking. Repeated storage mutations must not wrap an already-wrapped Intl constructor or permissions function.
- Keep the native-looking `toString()` behavior for active spoofed functions.
- Do not change provider, popup, manifest, or build logic unless absolutely required.

If restoring `navigator.language` / `navigator.languages` descriptors fails in a browser because the property is not configurable, fail soft and document it. Do not add large workarounds in this task without reporting the browser limitation.

## Tests to add

Extend the existing Node test harness or add a focused test file if cleaner. Since this is browser API patching behavior, full runtime coverage may be hard in Node, but add at least static/regression checks that would have caught the missing restore path:

- `content-inject.js` captures original descriptors/functions for Date, Intl, navigator language, and permissions.
- `content-inject.js` contains restore helpers or equivalent explicit restoration logic.
- `navigator.permissions.query` spoofing is gated by location/geolocation spoof being active, not unconditional.

Do not rely only on manual testing.

## Manual validation

After implementation:

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
```

Then in Firefox:

1. Reload the temporary add-on from `dist/firefox/manifest.json`.
2. Open the popup and click Refresh until Active.
3. Run:

```bash
node tools/serve-firefox-verify.mjs
```

4. Open:

```text
http://127.0.0.1:8765/
```

5. With all switches on, click Run checks. Confirm spoofed values.
6. Without refreshing the page, turn each switch off one by one and click Run checks after each change.
7. Confirm only that surface returns to real browser behavior.
8. Turn the switch back on and confirm spoofing reapplies without page refresh.

## Hard constraints

- Do not add telemetry.
- Do not add analytics.
- Do not add account systems.
- Do not add remote config.
- Do not collect page body text, browsing history, form contents, or user input.
- Do not break Chrome / Edge behavior.
- Do not revert the existing local `lib/providers.js` timezone-provider preference change.
- Do not rewrite the whole extension architecture.
- Do not change the privacy boundary.

## What to report back

When finished, report:

- Files changed.
- Exact restore strategy used.
- Validation commands run and results.
- Manual Firefox live-toggle results.
- Any browser limitations encountered.

