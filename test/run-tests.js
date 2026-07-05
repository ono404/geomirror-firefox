#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const TZ = require(path.join(__dirname, '..', 'lib', 'timezone.js'));
const Locale = require(path.join(__dirname, '..', 'lib', 'locale.js'));
const IPLoc = require(path.join(__dirname, '..', 'lib', 'providers.js'));

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

function eq(actual, expected) {
  assert.deepStrictEqual(actual, expected);
}

test('timezone offsets are DST-aware and use the supplied Date instance', () => {
  eq(TZ.tzOffsetMinutes('America/Los_Angeles', new Date('2026-06-15T12:00:00Z')), 420);
  eq(TZ.tzOffsetMinutes('America/Los_Angeles', new Date('2026-01-15T12:00:00Z')), 480);
  eq(TZ.tzOffsetMinutes('Europe/London', new Date('2026-06-15T12:00:00Z')), -60);
  eq(TZ.tzOffsetMinutes('Europe/London', new Date('2026-01-15T12:00:00Z')), 0);
  eq(TZ.tzOffsetMinutes('Asia/Tokyo', new Date('2026-06-15T12:00:00Z')), -540);
  eq(TZ.tzOffsetMinutes('Asia/Shanghai', new Date('2026-06-15T12:00:00Z')), -480);
});

test('timezone helper returns null for invalid IANA timezone', () => {
  eq(TZ.tzOffsetMinutes('Not/A_Zone', new Date('2026-06-15T12:00:00Z')), null);
});

test('locale inference handles country defaults', () => {
  eq(Locale.localeFor('JP', 'Asia/Tokyo'), {
    language: 'ja-JP',
    languages: ['ja-JP', 'ja', 'en-US', 'en'],
    acceptLanguage: 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  });
  eq(Locale.localeFor('BR', 'America/Sao_Paulo').language, 'pt-BR');
  eq(Locale.localeFor('US', 'America/New_York').language, 'en-US');
});

test('locale inference uses timezone tie-breakers', () => {
  eq(Locale.localeFor('CA', 'America/Montreal').language, 'fr-CA');
  eq(Locale.localeFor('CA', 'America/Toronto').language, 'en-CA');
  eq(Locale.localeFor('BE', 'Europe/Brussels').languages, ['nl-BE', 'nl', 'fr-BE', 'fr', 'en']);
});

test('locale inference falls back to neutral English', () => {
  eq(Locale.localeFor('ZZ', null), {
    language: 'en-US',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
  });
});

test('IP providers parse timezone fields without discarding location fields', () => {
  const providers = Object.fromEntries(IPLoc.IP_PROVIDERS.map((provider) => [provider.name, provider]));

  eq(providers['ipwho.is'].parse({
    ip: '203.0.113.1',
    city: 'Tokyo',
    region: 'Tokyo',
    country: 'Japan',
    country_code: 'JP',
    latitude: 35.6895,
    longitude: 139.6917,
    connection: { isp: 'Example ISP' },
    timezone: { id: 'Asia/Tokyo' },
  }), {
    ip: '203.0.113.1',
    city: 'Tokyo',
    region: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    lat: 35.6895,
    lon: 139.6917,
    isp: 'Example ISP',
    timezone: 'Asia/Tokyo',
  });

  eq(providers['ipapi.co'].parse({
    ip: '203.0.113.2',
    city: 'Los Angeles',
    region: 'California',
    country_name: 'United States',
    country_code: 'US',
    latitude: '34.05',
    longitude: '-118.24',
    org: 'Example Org',
    timezone: 'America/Los_Angeles',
  }).timezone, 'America/Los_Angeles');

  eq(providers['ipinfo.io'].parse({
    ip: '203.0.113.3',
    city: 'London',
    region: 'England',
    country: 'GB',
    loc: '51.5072,-0.1276',
    org: 'Example Org',
    timezone: 'Europe/London',
  }).timezone, 'Europe/London');
});

test('chrome manifest includes timezone helper before MAIN-world injector', () => {
  const manifest = require(path.join(__dirname, '..', 'manifest.json'));
  const mainScript = manifest.content_scripts.find((script) => script.world === 'MAIN');
  assert(mainScript, 'MAIN world content script is missing');
  eq(mainScript.js, ['lib/timezone.js', 'content-inject.js']);
  assert(manifest.permissions.includes('declarativeNetRequest'), 'DNR permission is required for Accept-Language');
});

test('chrome manifest keeps service_worker background (not Firefox-style scripts)', () => {
  const manifest = require(path.join(__dirname, '..', 'manifest.json'));
  assert(manifest.background && typeof manifest.background.service_worker === 'string',
    'Chrome manifest must declare background.service_worker');
  assert(manifest.background.scripts === undefined,
    'Chrome manifest should not declare background.scripts (Chrome <121 rejects it).');
});

test('firefox manifest source exists and is shaped for Firefox MV3', () => {
  const ff = require(path.join(__dirname, '..', 'manifest.firefox.json'));
  eq(ff.manifest_version, 3);
  assert(Array.isArray(ff.background && ff.background.scripts) && ff.background.scripts.length >= 4,
    'Firefox manifest must use background.scripts with library files before background.js');
  eq(ff.background.scripts, ['lib/geo.js', 'lib/providers.js', 'lib/locale.js', 'background.js']);
  assert(ff.background.service_worker === undefined,
    'Firefox manifest must not declare background.service_worker (Firefox ignores it / it confuses tooling).');
  // Permissions needed by current code.
  for (const p of ['storage', 'alarms', 'declarativeNetRequest']) {
    assert(ff.permissions && ff.permissions.includes(p),
      `Firefox manifest missing required permission: ${p}`);
  }
  // Broad host access is required for DNR modifyHeaders on arbitrary outgoing
  // requests and for content scripts on every page.
  assert(Array.isArray(ff.host_permissions) && ff.host_permissions.includes('<all_urls>'),
    'Firefox manifest must include <all_urls> for global DNR + content scripts');
  // Provider host permissions preserved from Chrome manifest.
  const chromeManifest = require(path.join(__dirname, '..', 'manifest.json'));
  for (const h of chromeManifest.host_permissions) {
    assert(ff.host_permissions.includes(h),
      `Firefox manifest dropped provider host permission: ${h}`);
  }
  assert(ff.browser_specific_settings && ff.browser_specific_settings.gecko,
    'Firefox manifest must include browser_specific_settings.gecko for MV3 lint/signing.');
  eq(ff.browser_specific_settings.gecko.id, 'geomirror@azurboy.github.io');
  eq(ff.browser_specific_settings.gecko.data_collection_permissions, {
    required: ['locationInfo'],
  });
});

test('firefox manifest preserves content-script worlds and order', () => {
  const ff = require(path.join(__dirname, '..', 'manifest.firefox.json'));
  assert(Array.isArray(ff.content_scripts) && ff.content_scripts.length === 2,
    'Firefox manifest must keep both content scripts');
  const main = ff.content_scripts.find((s) => s.world === 'MAIN');
  const isolated = ff.content_scripts.find((s) => s.world === 'ISOLATED');
  assert(main, 'Firefox MAIN-world content script missing');
  assert(isolated, 'Firefox ISOLATED-world content script missing');
  eq(main.js, ['lib/timezone.js', 'content-inject.js']);
  eq(isolated.js, ['content-bridge.js']);
  // Order: MAIN first, ISOLATED second (matches Chrome).
  assert(ff.content_scripts[0].world === 'MAIN', 'Firefox content_scripts[0] should be MAIN');
  assert(ff.content_scripts[1].world === 'ISOLATED', 'Firefox content_scripts[1] should be ISOLATED');
  for (const s of ff.content_scripts) {
    eq(s.run_at, 'document_start');
    eq(s.all_frames, true);
    eq(s.matches, ['<all_urls>']);
  }
});

test('background.js guards importScripts for both worker and event-page runtimes', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  assert(/typeof importScripts === ['"]function['"]/.test(src),
    'background.js must guard importScripts with a typeof check so Firefox event pages do not throw.');
  assert(/importScripts\(['"]lib\/geo\.js['"]/.test(src),
    'background.js must still call importScripts for the Chrome service-worker runtime.');
});

test('background.js keeps Accept-Language controlled by language switch, not location switch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  assert(/settings\s*&&\s*settings\.langEnabled/.test(src),
    'Accept-Language header rule must be gated by langEnabled.');
  assert(!/settings\s*&&\s*settings\.enabled\s*&&\s*settings\.langEnabled/.test(src),
    'Turning off Location spoof must not disable Accept-Language while Language spoof is still on.');
});

// ---------------------------------------------------------------------------
// Live toggle / restore regression checks for content-inject.js.
//
// These are static checks against the source text. Full browser runtime
// coverage of toggle-then-restore would need a DOM/JS engine harness; these
// checks exist so the missing-restore bug cannot silently come back.
// ---------------------------------------------------------------------------
function readInject() {
  const fs = require('fs');
  return fs.readFileSync(path.join(__dirname, '..', 'content-inject.js'), 'utf8');
}

test('content-inject.js captures originals for Date, Intl, navigator language, geolocation, and permissions before patching', () => {
  const src = readInject();
  // Captured at startup, before any override is installed.
  assert(/const\s+realTZO\s*=\s*Date\.prototype\.getTimezoneOffset/.test(src),
    'Must capture Date.prototype.getTimezoneOffset before patching so it can be restored.');
  assert(/const\s+realDTF\s*=\s*Intl\.DateTimeFormat/.test(src), 'Must capture Intl.DateTimeFormat.');
  assert(/const\s+realNumFmt\s*=\s*Intl\.NumberFormat/.test(src), 'Must capture Intl.NumberFormat.');
  assert(/const\s+realCol\s*=\s*Intl\.Collator/.test(src), 'Must capture Intl.Collator.');
  assert(/realPermQuery\s*=\s*navigator\.permissions\.query/.test(src),
    'Must capture navigator.permissions.query before patching so it can be restored.');
  assert(/realGeo\s*=\s*navigator\.geolocation/.test(src),
    'Must capture navigator.geolocation before patching.');
});

test('content-inject.js restore paths exist for each spoof surface', () => {
  const src = readInject();
  // Timezone: when inactive, the captured realTZO is assigned back.
  assert(/Date\.prototype\.getTimezoneOffset\s*=\s*realTZO/.test(src),
    'Inactive timezone path must restore Date.prototype.getTimezoneOffset = realTZO.');
  // Intl.DateTimeFormat: restored to realDTF when neither tz nor lang is active.
  assert(/Intl\.DateTimeFormat\s*=\s*realDTF/.test(src),
    'Inactive Intl.DateTimeFormat path must restore Intl.DateTimeFormat = realDTF.');
  // Intl.NumberFormat / Collator: restored when language spoof is off.
  assert(/Intl\[name\]\s*=\s*realCtor/.test(src),
    'Inactive Intl constructor path must restore Intl[name] = realCtor (covers NumberFormat + Collator).');
  // navigator.permissions.query: restored to realPermQuery when location spoof is off.
  assert(/navigator\.permissions\.query\s*=\s*realPermQuery/.test(src),
    'Inactive geolocation path must restore navigator.permissions.query = realPermQuery.');
  // navigator.language / languages: own accessor deleted so prototype property shows through.
  assert(/delete\s+navigator\.language/.test(src) && /delete\s+navigator\.languages/.test(src),
    'Inactive language path must delete the shadowing own accessors on navigator.language/languages.');
});

test('content-inject.js gates geolocation permission spoof by location spoof being active', () => {
  const src = readInject();
  // There must be a geoActive()-style gate that the permission wrapper checks
  // before returning the spoofed granted state.
  assert(/function\s+geoActive\(\)/.test(src),
    'A geoActive() helper must exist to gate the geolocation permission spoof.');
  // The applyPermissions function must check the gate and restore when off.
  assert(/applyPermissions[\s\S]*?if\s*\(!geoActive\(\)[^)]*\)[\s\S]*?navigator\.permissions\.query\s*=\s*realPermQuery/.test(src),
    'applyPermissions must restore the real query when location spoof is inactive.');
  // And the spoofed "granted" must only be returned inside the active branch.
  assert(/applyPermissions[\s\S]*?geoActive\(\)[\s\S]*?state:\s*['"]granted['"]/.test(src),
    'The spoofed granted permission must only be returned while location spoof is active.');
});

test('content-inject.js installs permission wrapper early and waits for bridge data before answering geolocation permission', () => {
  const src = readInject();
  assert(/applyPermissions\(\);\s*[\r\n]+[\s\S]*?\/\/ ---------------------------------------------------------------------------[\s\S]*?\/\/ Timezone override/.test(src),
    'Permission wrapper should be installed immediately, before ready.then(applyAll), so early page queries are intercepted.');
  assert(/if\s*\(!cache\)\s*{[\s\S]*?return\s+ready\.then/.test(src),
    'Early geolocation permission queries must wait for ready bridge data instead of leaking the real permission state.');
});

test('content-inject.js does not nest wrappers: apply helpers build from captured originals', () => {
  const src = readInject();
  // The DateTimeFormat wrapper must call `new realDTF(...)` (the captured
  // original), not `new Intl.DateTimeFormat(...)` (the live, possibly-wrapped
  // value). Same for the Intl constructor patcher and Date method.
  assert(/new\s+realDTF\(/.test(src),
    'DateTimeFormat wrapper must instantiate realDTF, not the live Intl.DateTimeFormat, to avoid stacking.');
  assert(/new\s+realCtor\(/.test(src),
    'Intl constructor wrapper must instantiate realCtor, not the live Intl[name], to avoid stacking.');
  // Date.prototype.getTimezoneOffset is assigned from realTZO on restore, and
  // the fake reads cache data — no chained call to a previously-installed fake.
  assert(!/getTimezoneOffset\.call\(this\)/.test(src),
    'Fake getTimezoneOffset must not chain to a previously-installed fake (would stack).');
});

test('content-inject.js passes DateTimeFormat options in the second argument when only timezone spoof is active', () => {
  const src = readInject();
  assert(/localeArg\s*===\s*undefined[\s\S]*?new\s+realDTF\(undefined,\s*opts\)/.test(src),
    'DateTimeFormat wrapper must call new realDTF(undefined, opts) so injected timeZone is treated as options when language spoof is off.');
  assert(!/localeArg\s*===\s*undefined\)\s*return\s+new\s+realDTF\(opts\)/.test(src),
    'DateTimeFormat wrapper must not pass the options object as the locales argument.');
});

if (process.exitCode) {
  console.error('\nTests failed.');
  process.exit(process.exitCode);
} else {
  console.log(`\n${passed} tests passed.`);
}
