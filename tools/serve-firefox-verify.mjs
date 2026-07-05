#!/usr/bin/env node
/**
 * Local manual verification page for the Firefox build.
 *
 * Usage:
 *   node tools/serve-firefox-verify.mjs
 *   open http://127.0.0.1:8765/
 */
import http from 'node:http';

const HOST = '127.0.0.1';
const START_PORT = 8765;
const MAX_PORT = 8790;

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GeoMirror Firefox Verification</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2328; }
    button { padding: 8px 14px; }
    pre { white-space: pre-wrap; border: 1px solid #d0d7de; padding: 12px; background: #f6f8fa; }
    .hint { color: #57606a; }
  </style>
</head>
<body>
  <h1>GeoMirror Firefox Verification</h1>
  <p class="hint">Click Run checks after the GeoMirror popup shows Active.</p>
  <button id="run">Run checks</button>
  <pre id="out">Waiting...</pre>
  <script>
    const out = document.getElementById('out');
    const print = (data) => { out.textContent = JSON.stringify(data, null, 2); };

    function getPosition() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve({ error: 'navigator.geolocation missing' });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          }),
          (err) => resolve({ error: err.message, code: err.code }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      });
    }

    async function run() {
      out.textContent = 'Running...';
      let geomirrorPayload = null;
      try {
        geomirrorPayload = JSON.parse(document.documentElement.getAttribute('data-geomirror') || 'null');
      } catch (e) {
        geomirrorPayload = { error: String(e) };
      }
      const permissions = navigator.permissions && navigator.permissions.query
        ? await navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state).catch((e) => String(e))
        : 'navigator.permissions unavailable';
      const position = await getPosition();
      const headerEcho = await fetch('/headers?ts=' + Date.now(), { cache: 'no-store' })
        .then((r) => r.json())
        .catch((e) => ({ error: String(e) }));

      print({
        pageUrl: location.href,
        geomirrorPayload,
        geolocationPermission: permissions,
        geolocation: position,
        timezone: {
          intlTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          offsetNow: new Date().getTimezoneOffset(),
          offsetWinterNY: new Date('2026-01-15T12:00:00Z').getTimezoneOffset(),
          offsetSummerNY: new Date('2026-06-15T12:00:00Z').getTimezoneOffset(),
        },
        language: {
          navigatorLanguage: navigator.language,
          navigatorLanguages: navigator.languages,
          dateTimeFormatLocale: Intl.DateTimeFormat().resolvedOptions().locale,
          numberFormatLocale: Intl.NumberFormat().resolvedOptions().locale,
          collatorLocale: Intl.Collator().resolvedOptions().locale,
          acceptLanguageHeaderSeenByLocalServer: headerEcho.headers && headerEcho.headers['accept-language'],
        },
      });
    }

    document.getElementById('run').addEventListener('click', run);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/headers')) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ headers: req.headers }, null, 2));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(page);
});

function listen(port) {
  server.once('error', (error) => {
    if (error && error.code === 'EADDRINUSE' && port < MAX_PORT) {
      console.log(`Port ${port} is already in use. Trying ${port + 1}...`);
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, HOST, () => {
    console.log(`GeoMirror verification page: http://${HOST}:${port}/`);
    console.log('Keep this terminal open while testing. Press Ctrl+C to stop.');
  });
}

listen(START_PORT);
