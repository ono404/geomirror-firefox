# GeoMirror technical notes

## Purpose

GeoMirror aligns the browser-visible profile with the current proxy/VPN exit IP. It does not change the network IP itself; it changes browser surfaces that otherwise commonly contradict the proxy location.

The extension currently spoofs:

- HTML5 geolocation (`navigator.geolocation`)
- geolocation permission query result
- JavaScript timezone offset (`Date.prototype.getTimezoneOffset`)
- default `Intl.DateTimeFormat` timezone
- `navigator.language`
- `navigator.languages`
- default `Intl.NumberFormat`, `Intl.Collator`, and `Intl.DateTimeFormat` locale
- outgoing `Accept-Language` header via Chrome `declarativeNetRequest`
- Chinese system/vendor font availability for non-Chinese exit profiles

## Runtime flow

1. `background.js` detects the visible exit IP location using multiple IP providers.
2. `lib/providers.js` tries `ipapi.co`, `ipwho.is`, and `ipinfo.io` before the
   final location-only `reallyfreegeoip` fallback. It normalizes provider
   responses and preserves IANA timezone IDs when providers return them.
3. `lib/geo.js` chooses a nearby residential-looking coordinate using Overpass/OpenStreetMap, with fallback logic when Overpass is unavailable.
4. `lib/locale.js` infers a plausible locale bundle from country code and timezone.
5. `background.js` stores the computed override and status in `chrome.storage.local`.
6. Chrome / Edge use `content-bridge.js` in the isolated extension world to publish storage state for `content-inject.js` in the page MAIN world.
7. Firefox uses `content-isolated.js` as its only content runtime. It reads extension storage directly and exports narrowly scoped page-callable wrappers without a DOM attribute, page global, message channel, or MAIN-world script.
8. `background.js` installs a dynamic DNR rule to set the outgoing `Accept-Language` request header when language spoofing is enabled. Firefox uses the `beacon` resource type; Chrome / Edge use `ping` for the same `sendBeacon` traffic.

## Browser-specific content architecture

Chrome / Edge retain two content scripts because their isolated-world script can access `chrome.storage`, while the MAIN-world script patches page-visible APIs:

- `content-bridge.js`: isolated world, reads storage and publishes the Chrome/Edge payload.
- `content-inject.js`: MAIN world, consumes that payload and patches browser APIs.

Firefox deliberately does not use that bridge. `manifest.firefox.json` loads only `lib/font-mask-isolated.js` and `content-isolated.js` in the ISOLATED world. Firefox-specific wrapper/export mechanisms keep storage access and page-visible behavior in one runtime while avoiding the former `data-geomirror` DOM marker and page-visible transport channel.

## Timezone implementation

`lib/timezone.js` computes the JavaScript `getTimezoneOffset` value for an IANA timezone at a specific `Date` instance. It uses `Intl.DateTimeFormat(..., { timeZone })` to format the same UTC instant as local wall time, then converts the difference back to the JavaScript sign convention:

- UTC+9 returns `-540`
- UTC-7 returns `+420`
- UTC-8 returns `+480`

This is DST-aware. The patched `Date.prototype.getTimezoneOffset` passes `this`, so historical/future dates use the correct offset for that date instead of the current offset.

### First-read protection

Content scripts cannot synchronously obtain the stored exit profile before the
first page script. GeoMirror therefore installs wrappers immediately with a
neutral `Etc/UTC` / `en-US` bootstrap. Chrome / Edge replace it when the bridge
payload arrives; Firefox replaces it when `chrome.storage.local` resolves in
the isolated runtime. This prevents an initial host-region leak while keeping
the asynchronous bootstrap transition explicit.

The provider chain also continues past a valid location-only response until it
finds a provider with an IANA timezone. If every timezone-capable provider
fails, the injector retains the neutral bootstrap rather than restoring the
host timezone.

## Language implementation

IP providers generally do not return a real user language. `lib/locale.js` uses deterministic offline inference:

- country code provides the default locale
- timezone refines multilingual countries where useful
- fallback is `en-US,en`

The resulting bundle is used for both JS-visible locale values and the HTTP `Accept-Language` header.

The DNR update is the language commit point. GeoMirror atomically removes and
adds rule 9001, retries bounded transient failures, and exposes a failure state
instead of silently claiming success. If an update fails, it reads the live
rule table: a retained rule keeps the complete ordered language list from its
actual header, an absent rule delegates page language to native behavior, and
an unreadable table keeps the last committed state. This keeps page-visible
language and the server-observed header coherent without adding a page global,
DOM transport, or MAIN-world bridge on Firefox.

## Regional font masking

When the exit profile is not Chinese and the font mask is enabled, GeoMirror
rewrites exact probes for common Chinese system and vendor fonts to standard
generic fallbacks. It does not generate per-document `zz...` family tokens.
Covered browser surfaces:

- `CanvasRenderingContext2D.font`
- `OffscreenCanvasRenderingContext2D.font`
- inline `CSSStyleDeclaration.font`, `fontFamily`, `cssText`, and `setProperty`
- `FontFaceSet.check` / `document.fonts.check`

The blocked-family set includes every Chinese-font probe currently used by the
FuckClaude canvas detector: Microsoft YaHei / SimSun / KaiTi / FangSong,
PingFang / Hiragino / ST families, Source Han and Noto CJK families,
WenQuanYi, HarmonyOS / MiSans / OPPO / vivo vendor families, WPS fonts, and
Founder / FZ families. Tests enforce that detector list so a future update
cannot silently drop one family. The mask automatically stays inactive for
`zh-*` locales and Chinese-region timezones.

## Limitations

- This is browser-surface alignment, not a full anti-fingerprinting system.
- Locale inference is heuristic.
- Provider timezone quality depends on the IP geolocation provider.
- Some pages can use high-entropy fingerprinting surfaces not covered here.
- Extensions cannot modify every possible low-level browser/network signal.
- JavaScript wrapper source/stack differences remain generically observable.
- In Firefox, spoofed Geolocation objects cannot reproduce the native
  `structuredClone` WebIDL internal-slot failure without a new, broader patch.
- A browser extension cannot change the timezone seen by native programs such
  as Claude Code; it changes web-page JavaScript surfaces only.

## Testing

Run:

```bash
node test/run-tests.js
node test/inject-smoke.js
node --check background.js
node --check content-isolated.js
node --check content-inject.js
node --check content-bridge.js
node --check lib/providers.js
node --check lib/locale.js
node --check lib/timezone.js
node --check lib/font-mask.js
node --check lib/font-mask-isolated.js
node --check popup.js
```

Build and lint the Firefox target as part of the same check:

```powershell
node --check tools/build-firefox.mjs
node --check tools/serve-firefox-verify.mjs
node tools/build-firefox.mjs
web-ext.cmd lint --source-dir dist/firefox
```

Manual browser verification:

1. Chrome / Edge: load the repository from the extensions page.
2. Firefox: build, then temporarily load `dist/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.
3. Trigger Refresh in the popup.
4. Run `node tools/serve-firefox-verify.mjs` and verify geolocation, language, timezone, and outgoing `Accept-Language`.
5. When font masking changes, verify the current FuckClaude detector and confirm ordinary non-Chinese fonts still render normally.
