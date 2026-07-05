# GeoMirror

> Make your browser profile match your visible IP: geolocation, timezone, language, and `Accept-Language` — automatically, on every page.

GeoMirror is a Chrome Manifest V3 extension for people who use proxies, VPNs, remote desktops, or regional network exits and want the browser-visible environment to be internally consistent.

[中文说明](./README.zh-CN.md) · [Privacy policy](./PRIVACY.md) · [Technical notes](./docs/TECHNICAL.md)

---

## Motivation: IP alone is not enough

Recent Claude / Anthropic account-ban controversies made one thing very clear: location-based risk controls can become brutal when they are applied mechanically. Many users reported that simply changing IPs, traveling, using VPNs, or having inconsistent regional signals could trigger account restrictions or bans. When a company such as Anthropic turns coarse address/location heuristics into account loss, the result is infuriating — but anger does not solve the operational problem.

The practical problem is this:

Most people only change their **IP address**. Their browser still exposes signals from somewhere else:

- `navigator.geolocation` may reveal the real physical location.
- `Date.prototype.getTimezoneOffset()` may reveal the local machine timezone.
- `Intl.DateTimeFormat().resolvedOptions().timeZone` may reveal the system timezone.
- `navigator.language` / `navigator.languages` may reveal the host language.
- the HTTP `Accept-Language` header may reveal another locale.

That mismatch is exactly the kind of thing automated risk systems can use as a proxy/VPN/fraud signal. GeoMirror exists to close that gap.

## What GeoMirror does

GeoMirror detects your visible **exit IP**, derives a plausible browser profile from that IP, and applies it locally inside Chrome:

| Surface | What GeoMirror changes |
| --- | --- |
| HTML5 geolocation | Spoofs `navigator.geolocation` to a residential-looking coordinate near the exit IP. |
| Geolocation permission | Reports geolocation permission as `granted` to avoid permission-state mismatch. |
| Timezone offset | Spoofs `Date.prototype.getTimezoneOffset()` with DST-aware IANA timezone logic. |
| Intl timezone | Spoofs default `Intl.DateTimeFormat` timezone and `resolvedOptions().timeZone`. |
| Browser language | Spoofs `navigator.language` and `navigator.languages`. |
| Intl locale | Spoofs default locale for `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.Collator`. |
| Request language | Sets outgoing `Accept-Language` via Chrome `declarativeNetRequest`. |

The goal is simple: if your IP looks like Tokyo, the browser should not still look like Shanghai, Los Angeles, or Berlin.

## Privacy model

GeoMirror is local-first and auditable:

- No account.
- No telemetry.
- No analytics.
- No page-content reading.
- No remote configuration.
- Computed overrides and settings are stored in `chrome.storage.local`.

Important accuracy note: GeoMirror is not a zero-network extension. To match your current exit IP automatically, it must call explicitly listed public IP/geolocation/map APIs through Chrome’s network stack. These requests are limited to:

- detecting the exit IP location,
- finding nearby residential roads,
- reverse-geocoding a display address for the popup.

It does not upload page content or browsing history. See [PRIVACY.md](./PRIVACY.md) and [docs/TECHNICAL.md](./docs/TECHNICAL.md) for the exact data flow.

## How it works

```
   proxy / VPN / remote exit          Chrome + GeoMirror
              │                              │
              ▼                              ▼
        visible exit IP ───────► background service worker
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
          IP geolocation      residential roads      reverse geocode
          + timezone          near exit IP            for popup display
                 │                    │                    │
                 └──────────────► computed override ◄──────┘
                                      │
                         stored in chrome.storage.local
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
          isolated-world bridge              MAIN-world injector
          reads extension storage            patches page-visible APIs
                    │                                   │
                    └────────────► page sees a coherent browser profile
```

Technical sequence:

1. `background.js` detects the visible exit IP using multiple providers.
2. `lib/providers.js` normalizes IP geolocation data and preserves provider timezone fields such as `Asia/Tokyo`.
3. `lib/geo.js` chooses a nearby residential-looking coordinate using OpenStreetMap / Overpass.
4. `lib/locale.js` infers a plausible locale bundle from country code + timezone.
5. `background.js` stores the override locally and installs a dynamic `Accept-Language` header rule.
6. `content-bridge.js` runs in Chrome’s isolated extension world, reads local storage, and publishes the payload into a DOM attribute.
7. `content-inject.js` runs in the page’s MAIN world at `document_start` and patches the browser APIs before page scripts run.

## Install

### Option A — load unpacked

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `geomirror` folder.
6. Pin GeoMirror and click **Refresh** in the popup.

### Option B — Chrome Web Store

A store listing is planned. Until then, use the unpacked extension.

### Option C — Firefox (development / temporary load)

Firefox uses a separate manifest because it does not support MV3 `background.service_worker` (it uses `background.scripts` / event pages) and declares `<all_urls>` host permission explicitly so the `Accept-Language` `declarativeNetRequest` rule has host access for outgoing requests on arbitrary sites.

Build the Firefox package:

```bash
node tools/build-firefox.mjs
```

This produces `dist/firefox/`, copying `background.js`, content scripts, popup, `lib/`, `icons/`, `PRIVACY.md`, `README.md`, and writing `manifest.firefox.json` as `dist/firefox/manifest.json`. It uses only Node built-ins — no npm dependencies.

Load it in Firefox:

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Choose `dist/firefox/manifest.json`.

Note: temporary add-ons disappear when Firefox restarts. This is the recommended path for development; signing for a permanent install is a separate step.

## Verify it works

Open a fingerprint/location test page and check these values:

```js
navigator.language
navigator.languages
Intl.DateTimeFormat().resolvedOptions()
new Date().getTimezoneOffset()
navigator.geolocation.getCurrentPosition(console.log, console.error)
```

Also check DevTools → Network → request headers and confirm `Accept-Language` matches the spoofed locale.

Useful public checks:

- https://browserleaks.com/geo
- https://browserleaks.com/javascript
- https://browserleaks.com/headers

## Settings

- **Location spoof** — enable/disable geolocation override.
- **Timezone spoof** — enable/disable `Date` and `Intl.DateTimeFormat` timezone override.
- **Language spoof** — enable/disable `navigator.language(s)`, Intl locale, and `Accept-Language` header override.
- **Reported accuracy (m)** — reported GPS accuracy, default 30 m.
- **Auto-refresh interval (minutes)** — how often GeoMirror re-detects the exit IP.
- **ipinfo.io token (optional)** — improves fallback reliability if you have a token.

## Why each permission

| Permission | Why |
| --- | --- |
| `storage` | Save settings and computed overrides locally. |
| `alarms` | Schedule periodic exit-IP refresh. |
| `declarativeNetRequest` | Set the outgoing `Accept-Language` header without reading page traffic. |
| `<all_urls>` content script | Patch browser APIs on normal web pages before page scripts run. |
| `host_permissions` | Call the explicitly listed IP/geolocation/Overpass/reverse-geocode providers. |
| `<all_urls>` host permission (Firefox package only) | Firefox `declarativeNetRequest.modifyHeaders` needs host permission on the request URL (and initiator for non-navigation requests) to rewrite `Accept-Language` on arbitrary outgoing requests. The Chrome / Edge manifest is kept unchanged; the Firefox package declares this host access explicitly. |
| `locationInfo` data collection permission (Firefox package only) | Mozilla's built-in data consent taxonomy requires declaring location data transmission because GeoMirror contacts IP geolocation, Overpass, and reverse-geocoding services to resolve the visible exit IP and nearby coordinate. This is not telemetry or browsing-history collection. |

## If you do not want to install this extension

You can ask your own coding agent to build a local version. Copy this prompt:

```text
Build a Chrome Manifest V3 extension that aligns browser-visible location signals with the current visible exit IP.

Requirements:
1. Detect the browser's visible exit IP location through Chrome's network stack using multiple fallback IP geolocation providers.
2. Preserve provider fields for country code, city/region/country, latitude/longitude, ISP, and IANA timezone.
3. Pick a nearby residential-looking coordinate instead of the raw IP centroid. Use OpenStreetMap Overpass highway=residential results when available, and a safe jitter fallback otherwise.
4. Infer a plausible locale bundle from country code + timezone: navigator.language, navigator.languages, and Accept-Language.
5. Store settings and computed overrides only in chrome.storage.local. Do not add telemetry, analytics, accounts, remote config, or page-content collection.
6. Use two content scripts:
   - an isolated-world bridge that can read chrome.storage and publish a JSON payload to the DOM;
   - a MAIN-world injector at document_start that patches page-visible APIs.
7. Patch:
   - navigator.geolocation.getCurrentPosition / watchPosition / clearWatch
   - navigator.permissions.query for geolocation
   - Date.prototype.getTimezoneOffset with DST-aware IANA timezone logic using the receiver Date instance
   - Intl.DateTimeFormat default timezone and resolvedOptions().timeZone
   - navigator.language and navigator.languages
   - Intl.DateTimeFormat / Intl.NumberFormat / Intl.Collator default locale
8. Use chrome.declarativeNetRequest to set the outgoing Accept-Language header when language spoofing is enabled.
9. Add a popup with toggles for location, timezone, language, accuracy, refresh interval, optional ipinfo token, and manual refresh.
10. Add tests for timezone DST offsets, locale inference, provider parsing, and manifest injection order.
11. Document the privacy model clearly: no telemetry, no page-content reading, local storage only, and explicit provider requests only for exit-IP/location matching.
```

## Limitations

- GeoMirror improves consistency. It is not a complete anti-fingerprinting system.
- IP geolocation is approximate.
- Locale inference is heuristic because IP providers do not know the real user language.
- Chrome extensions cannot inject into `chrome://`, the Chrome Web Store, or other privileged pages.
- Some platforms may use additional risk signals outside browser JavaScript and headers.

## Development

Project layout:

```
geomirror/
├── manifest.json              # Chrome / Edge MV3 manifest
├── manifest.firefox.json      # Firefox MV3 manifest (background.scripts + <all_urls>)
├── background.js
├── content-bridge.js
├── content-inject.js
├── docs/
│   └── TECHNICAL.md
├── lib/
│   ├── geo.js
│   ├── locale.js
│   ├── providers.js
│   └── timezone.js
├── popup.html
├── popup.css
├── popup.js
├── test/
│   └── run-tests.js
├── tools/
│   ├── gen-icons.py
│   └── build-firefox.mjs      # Builds dist/firefox/ for temporary load
└── icons/
```

Checks:

```bash
node test/run-tests.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check lib/providers.js
node --check lib/locale.js
node --check lib/timezone.js
node --check popup.js
node --check tools/build-firefox.mjs
```

Build the Firefox dev package:

```bash
node tools/build-firefox.mjs
```

Run the local Firefox verification page:

```bash
node tools/serve-firefox-verify.mjs
```

Open the printed `http://127.0.0.1:<port>/` URL in Firefox after loading the
temporary add-on, then use **Run checks** to verify geolocation, timezone,
language, Intl locale, and the outgoing `Accept-Language` header. If port 8765
is already in use, the helper automatically tries the next free port.

After changing files, reload the extension in `chrome://extensions`.

## Contributing

Pull requests welcome. Keep the permission surface minimal and preserve the no-telemetry, no-page-content-reading guarantees.

## License

[MIT](./LICENSE)
