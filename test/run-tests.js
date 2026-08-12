#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const TZ = require(path.join(__dirname, '..', 'lib', 'timezone.js'));
const Locale = require(path.join(__dirname, '..', 'lib', 'locale.js'));
const Fonts = require(path.join(__dirname, '..', 'lib', 'font-mask.js'));
const FontMaskIso = require(path.join(__dirname, '..', 'lib', 'font-mask-isolated.js'));
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

test('timezone helper preserves Invalid Date semantics', () => {
  assert(Number.isNaN(TZ.tzOffsetMinutes('America/Los_Angeles', new Date('invalid'))));
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

test('preferred providers run before the location-only fallback', () => {
  eq(IPLoc.IP_PROVIDERS[0].name, 'ipapi.co');
  const fallback = IPLoc.IP_PROVIDERS[IPLoc.IP_PROVIDERS.length - 1];
  eq(fallback.name, 'reallyfreegeoip');
  eq(fallback.parse({
    ip: '203.0.113.4',
    latitude: 34.05,
    longitude: -118.24,
  }).timezone, null);
  assert(
    IPLoc.IP_PROVIDERS.slice(0, -1).some((provider) =>
      provider.parse(provider.name === 'ipwho.is'
        ? { timezone: { id: 'America/Los_Angeles' } }
        : { timezone: 'America/Los_Angeles' }
      ).timezone === 'America/Los_Angeles'
    )
  );
});

test('font mask recognizes every family used by the FuckClaude canvas detector', () => {
  const fuckClaudeFamilies = [
    'Microsoft YaHei', 'Microsoft YaHei UI', 'SimSun', 'NSimSun', 'SimHei', 'KaiTi', 'FangSong', 'DengXian',
    'PingFang SC', 'Hiragino Sans GB', 'STHeiti', 'STSong', 'Songti SC',
    'Source Han Sans CN', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Serif CJK SC',
    'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei',
    'Microsoft JhengHei', 'PMingLiU', 'MingLiU', 'DFKai-SB', 'PingFang TC', 'PingFang HK',
    'Source Han Sans TW', 'Noto Sans CJK TC',
    'MiSans', 'MIUI', 'HarmonyOS Sans SC', 'HarmonyOS Sans', 'HONOR Sans', 'OPPO Sans', 'vivo Sans',
    'Alibaba PuHuiTi', 'Alibaba Sans', 'DingTalk JinBuTi', 'Douyin Sans', 'HYQiHei',
    'FZShuSong-Z01S', 'FZKai-Z03S', 'FZHei-B01S', 'FZFangSong-Z02S',
  ];
  for (const family of fuckClaudeFamilies) {
    assert(Fonts.containsBlockedFont(`72px "${family}", monospace`), `Missing font mask for ${family}`);
  }
  assert(Fonts.containsBlockedFont('12px FZCustomFont'));
  assert(!Fonts.containsBlockedFont('16px Arial, sans-serif'));
});

test('font mask rewrites only regional font families', () => {
  eq(
    Fonts.rewriteFontSpec("72px 'PingFang SC', monospace"),
    `72px '${Fonts.MASKED_FAMILY}', monospace`
  );
  eq(
    Fonts.rewriteFontSpec("72px 'Source Han Sans SC', monospace"),
    `72px '${Fonts.MASKED_FAMILY}', monospace`
  );
  eq(Fonts.rewriteFontSpec('16px Arial, sans-serif'), '16px Arial, sans-serif');
});

test('font mask stays off for Chinese exit profiles', () => {
  assert(Fonts.isChineseProfile('zh-CN', 'Asia/Shanghai'));
  assert(Fonts.isChineseProfile('en-US', 'Asia/Hong_Kong'));
  assert(!Fonts.isChineseProfile('en-US', 'America/Los_Angeles'));
});

test('manifest includes helpers before MAIN-world injector', () => {
  const manifest = require(path.join(__dirname, '..', 'manifest.json'));
  const mainScript = manifest.content_scripts.find((script) => script.world === 'MAIN');
  assert(mainScript, 'MAIN world content script is missing');
  eq(mainScript.js, ['lib/timezone.js', 'lib/font-mask.js', 'content-inject.js']);
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

test('firefox manifest keeps a single ISOLATED content script with the isolated injector', () => {
  const ff = require(path.join(__dirname, '..', 'manifest.firefox.json'));
  assert(Array.isArray(ff.content_scripts) && ff.content_scripts.length === 1,
    'Firefox manifest must keep exactly one content script (isolated only)');
  const isolated = ff.content_scripts[0];
  eq(isolated.world, 'ISOLATED');
  eq(isolated.js, ['lib/font-mask-isolated.js', 'content-isolated.js']);
  assert(!ff.content_scripts.some((s) => s.world === 'MAIN'),
    'Firefox manifest must not run a MAIN-world content script');
  eq(isolated.run_at, 'document_start');
  eq(isolated.all_frames, true);
  eq(isolated.matches, ['<all_urls>']);
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

function readFile(rel) {
  const fs = require('fs');
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
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

test('font-mask-isolated conversion never invents a family: keeps input fallbacks, uses standard generics otherwise', () => {
  // Blocked family + ordinary fallback: the fallback from the INPUT survives.
  eq(FontMaskIso.rewriteFontSpec("72px 'PingFang SC', monospace"), "72px monospace");
  eq(FontMaskIso.rewriteFontSpec('"Microsoft YaHei", sans-serif'), 'sans-serif');
  eq(FontMaskIso.rewriteFontSpec('"Helvetica Neue", "Microsoft YaHei"'), '"Helvetica Neue"');
  // No fallback in the input: only a standard CSS generic family is used.
  eq(FontMaskIso.rewriteFontSpec("72px 'PingFang SC'"), '72px sans-serif');
  eq(FontMaskIso.rewriteFontSpec('"Microsoft YaHei"'), 'sans-serif');
  eq(FontMaskIso.rewriteFontSpec('12px FZCustomFont'), '12px sans-serif');
  // Vendor/Chinese families are covered too.
  eq(FontMaskIso.rewriteFontSpec('12px 方正兰亭黑, serif'), '12px serif');
  // No output may contain a self-made (random/fixed/UUID/hash) family.
  for (const out of [
    FontMaskIso.rewriteFontSpec("72px 'PingFang SC', monospace"),
    FontMaskIso.rewriteFontSpec('"Microsoft YaHei"'),
    FontMaskIso.rewriteFontSpec('font-family: "PingFang SC", monospace'),
  ]) {
    assert(!/zz[0-9a-f]{12}|GeoMirror|mirror|__|^[0-9a-f]{12,}$/i.test(out),
      `no self-made family may appear: ${out}`);
  }
  assert.strictEqual(FontMaskIso.containsBlockedFont("72px 'HarmonyOS Sans SC'"), true);
  assert.strictEqual(FontMaskIso.containsBlockedFont('12px Arial'), false);
});

test('font-mask-isolated conversion shares one semantic across every supported entry shape', () => {
  // The same conversion serves Canvas/Offscreen/style.font shorthands,
  // style.fontFamily lists, cssText declaration blocks and setProperty.
  eq(FontMaskIso.rewriteFontSpec('16px "Microsoft YaHei", sans-serif'), '16px sans-serif');
  eq(FontMaskIso.rewriteFontSpec('"Microsoft YaHei", sans-serif'), 'sans-serif');
  eq(FontMaskIso.rewriteFontSpec('font-family: "Microsoft YaHei", sans-serif; color: rgb(1, 2, 3)'),
    'font-family: sans-serif; color: rgb(1, 2, 3)');
  eq(FontMaskIso.rewriteFontSpec('font: 16px "Microsoft YaHei", serif; color: red'),
    'font: 16px serif; color: red');
  eq(FontMaskIso.rewriteFontSpec('italic bold 16px/1.5 "PingFang SC", "Helvetica Neue"'),
    'italic bold 16px/1.5 "Helvetica Neue"');
  eq(FontMaskIso.rewriteFontSpec('12px SimSun, "Microsoft YaHei UI", serif'), '12px serif');
  // Double blocked family still yields one generic.
  eq(FontMaskIso.rewriteFontSpec('"Microsoft YaHei", "Microsoft YaHei"'), 'sans-serif');
});

test('font-mask-isolated conversion leaves non-blocked values byte-identical (mask inactive semantics)', () => {
  eq(FontMaskIso.rewriteFontSpec('16px Arial, sans-serif'), '16px Arial, sans-serif');
  eq(FontMaskIso.rewriteFontSpec('Arial'), 'Arial');
  eq(FontMaskIso.rewriteFontSpec('font-family: Arial; color: blue'), 'font-family: Arial; color: blue');
  eq(FontMaskIso.rewriteFontSpec('12px "Times New Roman", serif'), '12px "Times New Roman", serif');
});

test('content-isolated.js routes every supported font entry through the single maskedFont conversion', () => {
  const src = readFile('content-isolated.js');
  // One conversion entry point, gated by the active check.
  assert(/function maskedFont\(value\) \{[\s\S]*?fontMaskActive\(\) \? GeoMirrorFontMask\.rewriteFontSpec\(value\) : value/.test(src),
    'maskedFont must be the single conversion entry gated by fontMaskActive');
  // Every supported entry (canvas, offscreen, cssText setter, setProperty,
  // the named-properties hook) must call maskedFont, never rewrite directly.
  const calls = (src.match(/maskedFont\(value\)/g) || []).length;
  assert(calls >= 3, `maskedFont must be used by all patch sites (found ${calls})`);
  assert(!/GeoMirrorFontMask\.rewriteFontSpec\([^)]*,\s*[^)]*\)/.test(src),
    'rewriteFontSpec must never receive a caller-supplied family');
});

test('content-isolated.js patches style.font/fontFamily on the named-properties object, never via prototype or instance', () => {
  const src = readFile('content-isolated.js');
  assert(/Object\.getPrototypeOf\(el\.style\)/.test(src),
    'the shared named-properties object must be captured for the font/fontFamily hook');
  assert(/installStyleFontHook\(\);/.test(src), 'the named-properties hook must be installed');
  assert(!/patchSetter\(rawStyle, 'font'\)/.test(src) && !/patchSetter\(rawStyle, 'fontFamily'\)/.test(src),
    'prototype patchSetter for font/fontFamily must be gone (no descriptor exists in Firefox)');
});

test('content-isolated.js generates no self-made family of any kind', () => {
  const src = readFile('content-isolated.js');
  assert(!src.includes('randomUUID'), 'no crypto.randomUUID family generation');
  assert(!src.includes('maskedFamily'), 'no maskedFamily variable');
  assert(!/zz'?\s*\+/.test(src), 'no zz-prefixed family construction');
  assert(!/Math\.random\(\).*font|font.*Math\.random\(\)/.test(src), 'no random font family');
});

test('font-mask-isolated profile detection matches the shared module', () => {
  assert.strictEqual(FontMaskIso.isChineseProfile('zh-CN', 'Asia/Shanghai'), true);
  assert.strictEqual(FontMaskIso.isChineseProfile('ja-JP', 'Asia/Tokyo'), false);
  assert.strictEqual(FontMaskIso.isChineseProfile('en-US', 'Etc/UTC'), false);
});

test('content-isolated.js has no page-visible channel, global or payload', () => {
  const src = readFile('content-isolated.js');
  for (const marker of ['data-geomirror', 'GeoMirrorTZ', 'GeoMirrorFonts', 'CustomEvent', 'postMessage', 'MessageChannel']) {
    assert(!src.includes(marker), `content-isolated.js must not contain ${marker}`);
  }
  assert(!/window\s*\.\s*addEventListener/.test(src),
    'the injector must never register a listener on the window (no page channel)');
  assert(!/document\s*\.\s*addEventListener/.test(src),
    'the injector must never register a listener on the document');
  assert(!/world:\s*['"]MAIN['"]/.test(src), 'Firefox injector must not reference the MAIN world');
  assert(!/window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/.test(src) && !/root\.[A-Za-z_$]/.test(src),
    'Firefox injector must not write window/global properties');
});

test('content-isolated.js delegates to captured natives and derives descriptors from originals', () => {
  const src = readFile('content-isolated.js');
  assert(/origTZO\.call\(this\)/.test(src), 'getTimezoneOffset wrapper must delegate to the captured native');
  assert(/Number\.isNaN\(nativeResult\)/.test(src), 'Invalid Date NaN must pass through');
  assert(/Object\.assign\(\{\}, origDesc, \{ value \}\)/.test(src) || /Object\.assign\(\{\}, origDesc, \{ get \}\)/.test(src),
    'descriptors must be derived from captured originals, never hardcoded');
  assert(/storage\.onChanged\.addListener/.test(src), 'state updates must flow through storage.onChanged');
});

// ---------------------------------------------------------------------------
// Static structure tests for the geolocation/permission rewrite.
// These assert DESIGN FACTS in the source; they cannot exercise Firefox
// compartment/Xray behavior, so they are structural, not runtime, regression
// tests. Runtime acceptance requires the controlled browser run.
// ---------------------------------------------------------------------------

test('STRUCTURAL: the spoof receiver check recognizes ONLY the extension-created fakeGeo, never via instanceof', () => {
  const src = readFile('content-isolated.js');
  // The classification helper takes an explicit receiver parameter and
  // compares identity via wrappedJSObject (the receiver arrives as an Xray
  // wrapper). getCurrentPosition routes through gcpImpl(self, ...);
  // watchPosition and clearWatch check directly.
  const calls = (src.match(/isFakeGeoReceiver\((this|self)\)/g) || []).length;
  assert(calls >= 3, `expected an explicit receiver in all three method paths (found ${calls})`);
  assert(!/isFakeGeoReceiver\(\)/.test(src), 'no receiver check may rely on implicit this');
  assert(/function isFakeGeoReceiver\(receiver\)/.test(src),
    'isFakeGeoReceiver must take an explicit receiver parameter');
  assert(/gcpImpl\(this, success/.test(src), 'getCurrentPosition must pass its receiver into the spoof core');
  // Requirement: instanceof must NOT be the spoofing criterion — it cannot
  // distinguish fakeGeo from Object.create(Geolocation.prototype) impostors.
  assert(!/receiver instanceof rawWin\.Geolocation/.test(src) && !/this instanceof rawWin\.Geolocation/.test(src),
    'receiver classification must not use instanceof Geolocation');
  assert(/receiver\.wrappedJSObject === fakeGeo/.test(src),
    'fakeGeo recognition must compare identity through the Xray waiver');
});

test('STRUCTURAL: fakeGeo receiver with spoof disabled delegates to the captured native on the REAL Geolocation instance', () => {
  const src = readFile('content-isolated.js');
  // fakeGeo has no WebIDL internal slots; when spoof is off, the native
  // method must be invoked with realGeo as the receiver.
  assert(/delegateGeo\(realGCP, realGeo, success, error, options, argCount\)/.test(src),
    'getCurrentPosition (spoof off) must call the native on realGeo');
  assert(/delegateGeo\(realWP, realGeo, success, error, options, argCount\)/.test(src),
    'watchPosition (spoof off) must call the native on realGeo');
  assert(/Reflect\.apply\(realCW, realGeo, \[\]\)/.test(src),
    'clearWatch with no arguments must raise the native arg-count error via realGeo');
  assert(/Reflect\.apply\(realCW, realGeo, \[entry\.nativeId\]\)/.test(src), 'clearWatch of native page ids must forward the INTERNAL native id on realGeo');
});

test('STRUCTURAL: fakeGeo getCurrentPosition with invalid arguments delegates on realGeo for native parameter validation', () => {
  const src = readFile('content-isolated.js');
  // After the receiver is confirmed as fakeGeo, an invalid success/error/
  // options shape must reach the native WebIDL conversion with realGeo as
  // the receiver — fakeGeo would fail the native receiver check first,
  // yielding the wrong error for a wrong-argument call.
  const gcpStart = src.indexOf('function gcpImpl');
  const gcpEnd = src.indexOf('function getCurrentPosition');
  assert(gcpStart >= 0 && gcpEnd > gcpStart, 'gcpImpl body must be extractable');
  const gcp = src.slice(gcpStart, gcpEnd);
  assert(/badOpt\(options\)\) \{[\s\S]{0,800}?delegateGeo\(realGCP, realGeo, success, error, options, argCount\)/.test(gcp),
    'gcpImpl invalid-argument branch must delegate on realGeo');
  assert(!/badOpt\(options\)\) \{[\s\S]{0,800}?delegateGeo\(realGCP, self/.test(gcp),
    'gcpImpl invalid-argument branch must never pass the fakeGeo receiver');
});

test('STRUCTURAL: fakeGeo watchPosition with invalid arguments delegates on realGeo for native parameter validation', () => {
  const src = readFile('content-isolated.js');
  const wpStart = src.indexOf('function watchPosition');
  const wpEnd = src.indexOf('function clearWatch');
  assert(wpStart >= 0 && wpEnd > wpStart, 'watchPosition body must be extractable');
  const wp = src.slice(wpStart, wpEnd);
  assert(/badOpt\(options\)\) \{[\s\S]{0,800}?delegateGeo\(realWP, realGeo, success, error, options, argCount\)/.test(wp),
    'watchPosition invalid-argument branch must delegate on realGeo');
  assert(!/badOpt\(options\)\) \{[\s\S]{0,800}?delegateGeo\(realWP, this/.test(wp),
    'watchPosition invalid-argument branch must never pass the fakeGeo receiver');
});

test('STRUCTURAL: non-fakeGeo receivers keep the ORIGINAL receiver when delegating to the native', () => {
  const src = readFile('content-isolated.js');
  // The extension never judges whether another receiver is legal: real
  // native instances execute, impostors ({}, Object.create(proto), proxies)
  // make the native binding raise its own error.
  assert(/delegateGeo\(realGCP, self, success, error, options, argCount\)/.test(src),
    'gcpImpl must hand the original receiver to the native for non-fakeGeo receivers');
  assert(/delegateGeo\(realWP, this, success, error, options, argCount\)/.test(src),
    'watchPosition must hand the original receiver to the native for non-fakeGeo receivers');
  assert(/Reflect\.apply\(realCW, this, arguments\)/.test(src),
    'clearWatch must hand the original receiver to the native for non-fakeGeo receivers');
});

test('STRUCTURAL: spoof and native watch IDs are distinguishable by an explicit registry, not by value', () => {
  const src = readFile('content-isolated.js');
  // A1 (watch-position page-ID fit): spoof AND fakeGeo-native watches share
  // ONE document-level positive monotonic page namespace; the registry
  // records each page id's source (spoof handler vs internal native id).
  // [MINIMAL REPLACEMENT of the old negative-namespace assertions]
  assert(/const watchSources = new Map\(\)/.test(src), 'a watch-source registry must exist');
  assert(/const id = \+\+watchCounter/.test(src), 'page watch IDs must be allocated from a positive monotonic counter');
  assert(!/\(\+\+watchCounter\)/.test(src), 'the negative spoof namespace must be gone');
  assert(/watchSources\.set\(id, \{\s*source: 'spoof',\s*handler:/.test(src), 'spoof IDs must be recorded as spoof entries');
  assert(/watchSources\.set\(id, \{ source: 'native', nativeId \}\);/.test(src), 'native watch IDs must be recorded as native entries keyed by page id');
});

test('STRUCTURAL: clearWatch decides ID source from the registry, never from the current switch state', () => {
  const src = readFile('content-isolated.js');
  const cwStart = src.indexOf('function clearWatch');
  const cwEnd = src.indexOf('function applyGeolocation');
  assert(cwStart >= 0 && cwEnd > cwStart, 'clearWatch body must be extractable');
  const cw = src.slice(cwStart, cwEnd);
  assert(/watchSources\.get\(id\)/.test(cw), 'clearWatch must consult the registry');
  assert(!/geoActive\(\)/.test(cw), 'clearWatch must not guess the ID source from the switch state');
  // [MINIMAL REPLACEMENT: registry values are now entries, not strings]
  assert(/entry\.source === 'spoof'/.test(cw), 'spoof page ids must be cleaned via the mapping entry');
  assert(/realCW, realGeo, \[entry\.nativeId\]/.test(cw), 'native page ids must forward the INTERNAL native id to the captured clearWatch');
});

test('STRUCTURAL: runtime behavior of non-fakeGeo receivers is NOT claimed by static tests', () => {
  // Per Codex: "Object.create(Geolocation.prototype) must raise the native
  // error at runtime". That is a RUNTIME acceptance item for the controlled
  // browser run. This static test only pins the delegation DESIGN — the
  // original receiver reaches the native method (asserted in the
  // 'non-fakeGeo receivers keep the ORIGINAL receiver' test above). It does
  // not and cannot claim the runtime outcome; nothing in this suite asserts
  // that impostor receivers were observed throwing in a browser.
  const src = readFile('content-isolated.js');
  assert(/never construct our own TypeError|never our own TypeError/.test(src),
    'the design must document that errors come from the native binding, not from this compartment');
});

test('STRUCTURAL: pending geolocation calls queue only synchronously extracted data, never the arguments object', () => {
  const src = readFile('content-isolated.js');
  // The queued re-invocation passes the extracted callbacks/options/count,
  // not the page arguments object.
  assert(/gcpImpl\(self, success, error, options, argCount\)/.test(src),
    'waiter must re-invoke with extracted values only');
  assert(!/gcpImpl\(self, args\)/.test(src), 'gcpImpl must not receive the arguments object');
  assert(!/waiters\.push[\s\S]{0,160}?arguments/.test(src),
    'no waiter closure may capture the page arguments object');
  assert(/delegateGeo\(realMethod, self, success, error, options, argCount\)/.test(src),
    'delegation must rebuild args from extracted values');
});

test('STRUCTURAL: the pending geolocation permission promise never settles via an immediate microtask', () => {
  const src = readFile('content-isolated.js');
  assert(!/Promise\.resolve\(\)\.then/.test(src),
    'pending permission must not use an immediately-resolving promise chain');
  assert(/new window\.Promise/.test(src) && /permQueryers\.push\(/.test(src),
    'pending permission must create a page-realm promise (via the Xray window) whose executor queues the resolver');
});

test('STRUCTURAL: non-geolocation permissions keep the native delegation path', () => {
  const src = readFile('content-isolated.js');
  assert(/nativeQueryTramp\(json\)/.test(src), 'non-geolocation descriptors must delegate via the native trampoline');
  assert(/nativeQueryNoArgs\(\)/.test(src), 'zero-argument queries must delegate with the native no-arg trampoline');
  assert(/name === 'geolocation'/.test(src), 'only the geolocation descriptor name takes the spoof branch');
});

test('STRUCTURAL: fake WebIDL attribute flags are declared directly with their design basis, with no obfuscation', () => {
  const src = readFile('content-isolated.js');
  // Position/Coordinates/PositionError own attributes are hand-built
  // page-realm (READONLY_ACC) with the WebIDL readonly-attribute default
  // flags, because native instances carry them on the prototype, not as own
  // properties. The install paths on real prototypes derive flags from
  // captured originals (asserted above).
  const direct = (src.match(/enumerable: true, configurable: true/g) || []).length;
  assert(direct >= 1, `fake attribute builders must declare WebIDL default flags (found ${direct})`);
  // P-05/P-08b: PermissionStatus.state/onchange are NOT hand-built own
  // attributes — spoofed instances carry NO own properties and resolve both
  // through controlled accessors on the shared native prototype, backed by
  // the isolated-side table; their descriptors derive from the captured
  // originals (flags preserved).
  assert(/permStatusKey\(/.test(src) && /permStatusTable\.set\(key/.test(src) && /permStatusTable\.get\(key/.test(src),
    'controlled PermissionStatus accessors must use the single canonical table key (no unreachable fallback)');
  assert(/Object\.assign\(\{\}, origStateDesc, \{\s*get: exportFunction/.test(src),
    'controlled state accessor descriptor must derive from the captured original (flags preserved)');
  assert(/Object\.assign\(\{\}, origOnchangeDesc, \{\s*get: exportFunction[\s\S]*?set: exportFunction/.test(src),
    'controlled onchange accessor descriptor must derive from the captured original (flags preserved)');
  assert(!/Object\.defineProperty\(s,\s*["']state["']/.test(src),
    'spoofed PermissionStatus instances must NOT carry an own state accessor (own-vs-prototype parity)');
  // Round-3 REVISE: no page trampoline, no own toString shim — accessors are
  // exportFunction results with name projected from the content function and
  // arity matching the native (getter 0, setter 1). Key failure explicitly
  // falls back to the native query result.
  assert(!/makePageAccessor/.test(src) && !/return "\[native code\]";/.test(src),
    'no page accessor trampoline and no own toString shim (both are fingerprintable)');
  assert(/Object\.defineProperty\(stateGetter, 'name', \{ value: 'get state'/.test(src)
      && /Object\.defineProperty\(onchangeSetter, 'name', \{ value: 'set onchange'/.test(src),
    'accessor names must be projected from the content functions (get state / set onchange)');
  assert(/const onchangeSetter = function \(value\)/.test(src),
    'onchange setter must declare arity 1 like the native EventHandler setter');
  assert(/if \(!key\) \{[\s\S]*?return nativeQueryTramp/.test(src),
    'unregisterable status instances must explicitly fall back to the native permissions.query result');
  assert(/s\.addEventListener\('change', dispatcher\)/.test(src),
    'the change listener must be a fixed dispatcher registered once at instance build time');
  assert(!/removeEventListener\('change'/.test(src),
    'the onchange setter must not reorder the listener list (table-entry update only)');
  assert(!/var en = true|enumerable: en/.test(src),
    'descriptor flags must not be hidden behind variable indirection');
});

test('STRUCTURAL: permStatusKey resolves raw waiver objects and Xray wrappers to ONE canonical key', () => {
  const src = readFile('content-isolated.js');
  const kStart = src.indexOf('function permStatusKey');
  const kEnd = src.indexOf('const nativeQueryTramp');
  assert(kStart >= 0 && kEnd > kStart, 'permStatusKey body must be extractable');
  const keyFn = src.slice(kStart, kEnd);
  // R9-1 runtime finding: makePageFn returns RAW page-realm objects (the
  // wrappedJSObject waiver never wraps its return values), which have no
  // .wrappedJSObject of their own — the old null-return made every spoofed
  // PermissionStatus fall back to the native query. The key helper must
  // unwrap Xray wrappers AND accept the raw object itself as its own key.
  assert(/instance\.wrappedJSObject\s*\)\s*return instance\.wrappedJSObject/.test(keyFn),
    'Xray wrappers must be unwrapped through wrappedJSObject');
  assert(/return instance \|\| null;/.test(keyFn),
    'raw objects (no wrappedJSObject) must be accepted as their own key; only null/undefined yield null');
  // Exactly ONE table-key derivation: the builder registers via the key
  // helper, and no alternate key path (raw object or direct wrappedJSObject)
  // may bypass it — that was the round-2 unreachable-fallback defect class.
  assert(/permStatusTable\.set\(key/.test(src), 'the builder must register via the permStatusKey-derived key');
  assert(!/permStatusTable\.set\(s\b/.test(src), 'no raw-object key may bypass the canonical helper');
  assert(!/permStatusTable\.set\(s\.wrappedJSObject/.test(src), 'no direct wrappedJSObject key may bypass the canonical helper');
  // Both read sides (state getter, onchange getter/setter) must use the same
  // helper — no inline key derivation anywhere else.
  assert(/const key = permStatusKey\(this\);/.test(src), 'accessors must derive the key via permStatusKey(this)');
  assert(/const key = permStatusKey\(s\);/.test(src), 'the builder must derive the key via permStatusKey(s)');
});

// ---------------------------------------------------------------------------
// F011 regression: the dynamic Accept-Language DNR rule must cover every
// VERIFIED surface (main_frame / sub_frame / xmlhttprequest plus the five
// measured gaps script / image / stylesheet / font / beacon) while keeping
// the same rule id, the same set-value header action and the same langEnabled
// gate. Runtime coverage of all nine surfaces is accepted separately with the
// controlled Firefox matrix; these tests pin the rule shape in source.
// ---------------------------------------------------------------------------
test('F011: DNR Accept-Language rule covers exactly the eight frozen resource types', () => {
  const src = readFile('background.js');
  const m = src.match(/resourceTypes:\s*\[([^\]]*)\]/);
  assert(m, 'background.js must declare a resourceTypes array inside the DNR rule');
  const types = m[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''));
  eq(types, ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'beacon']);
});

test('F011: Accept-Language rule keeps rule id 9001, set-value header action and langEnabled gating', () => {
  const src = readFile('background.js');
  assert(/const AL_RULE_ID = 9001/.test(src), 'rule id must stay 9001');
  assert(/id: AL_RULE_ID/.test(src), 'the addRules entry must use AL_RULE_ID');
  assert(/removeRuleIds:\s*\[AL_RULE_ID\]/.test(src), 'the remove path must use AL_RULE_ID');
  assert(/header:\s*'accept-language'[\s\S]{0,80}?operation:\s*'set'[\s\S]{0,80}?value:\s*al/.test(src),
    'the rule must set accept-language to the override value');
  assert(/if \(!\(settings && settings\.langEnabled\)\) return;/.test(src),
    'the rule must stay gated by langEnabled');
});

// ---------------------------------------------------------------------------
// FONT round 2 regressions: legal font-shorthand semantics and page-readable
// NPO setter source. Round 1 closed D-FONT-01 (route split) and D-FONT-02
// (zz marker); round 2 fixes (a) shorthand components being collapsed into a
// family list and (b) the NPO setter source exposing mask implementation
// identifiers (activeImpl/maskImpl).
// ---------------------------------------------------------------------------

test('font-mask-isolated keeps every non-family shorthand component: medium/small/larger/calc/clamp/numeric', () => {
  const cases = [
    // size keyword medium + line-height, style/variant/weight preserved
    ['italic small-caps bold medium/1.2 "Microsoft YaHei", serif', 'italic small-caps bold medium/1.2 serif'],
    // size keyword small
    ['italic bold small "PingFang SC", monospace', 'italic bold small monospace'],
    // size keyword larger + numeric weight
    ['normal 700 larger "Microsoft YaHei", sans-serif', 'normal 700 larger sans-serif'],
    // calc() size (commas/parens inside the function must survive)
    ['italic calc(12px + 1vw)/1.4 "Microsoft YaHei", serif', 'italic calc(12px + 1vw)/1.4 serif'],
    // clamp() size (commas INSIDE the function are not family separators)
    ['italic clamp(1rem, 2vw, 2rem)/1.5 "PingFang SC", monospace', 'italic clamp(1rem, 2vw, 2rem)/1.5 monospace'],
    // numeric size with line-height
    ['italic bold 16px/1.5 "Microsoft YaHei", serif', 'italic bold 16px/1.5 serif'],
    // blocked-only shorthand: size kept, standard generic supplied
    ['medium "Microsoft YaHei"', 'medium sans-serif'],
    // stretch percentage + oblique angle in the prefix survive
    ['italic 80% 12px "Microsoft YaHei", serif', 'italic 80% 12px serif'],
    ['italic oblique 10deg 12px/1.2 "Microsoft YaHei", Arial', 'italic oblique 10deg 12px/1.2 Arial'],
  ];
  for (const [input, expected] of cases) {
    const out = FontMaskIso.rewriteFontSpec(input);
    eq(out, expected);
    assert(!/zz[0-9a-f]{12}|GeoMirror|mirror|__|^[0-9a-f]{12,}$/i.test(out),
      `no self-made family may appear: ${out}`);
  }
});

test('font-mask-isolated matches blocked families exactly, never by substring', () => {
  // A family whose NAME merely contains a blocked name is ordinary and must
  // survive byte-identically.
  eq(FontMaskIso.rewriteFontSpec('16px "Not Microsoft YaHei Custom", serif'),
    '16px "Not Microsoft YaHei Custom", serif');
  eq(FontMaskIso.rewriteFontSpec('"Not Microsoft YaHei Custom"'), '"Not Microsoft YaHei Custom"');
  eq(FontMaskIso.rewriteFontSpec('16px MyMicrosoft YaHei, serif'), '16px MyMicrosoft YaHei, serif');
  eq(FontMaskIso.rewriteFontSpec('16px "PingFang SC Remake", monospace'), '16px "PingFang SC Remake", monospace');
  // The contains gate must use the same exact semantics.
  assert.strictEqual(FontMaskIso.containsBlockedFont('12px "Not Microsoft YaHei Custom"'), false);
  assert.strictEqual(FontMaskIso.containsBlockedFont('12px "Microsoft YaHei"'), true);
  // Exact hits are still removed, quoted and unquoted alike.
  eq(FontMaskIso.rewriteFontSpec('16px "Microsoft YaHei", serif'), '16px serif');
  eq(FontMaskIso.rewriteFontSpec('16px Microsoft YaHei, serif'), '16px serif');
  eq(FontMaskIso.rewriteFontSpec('16px "PingFang SC", monospace'), '16px monospace');
});

test('font-mask-isolated has no incomplete numeric-size heuristic (SIZE_TOKEN removed)', () => {
  const src = readFile('lib/font-mask-isolated.js');
  // Round-1 size detection only matched numeric units; size keywords
  // (medium/small/larger), calc() and clamp() fell through to the family
  // list and were destroyed. The old token must be gone and a real tokenizer
  // must be present instead.
  assert(!/SIZE_TOKEN/.test(src), 'the incomplete SIZE_TOKEN regex must be removed');
  assert(!src.includes('px|em|rem|pt|pc|in|cm|mm|q|ex|ch|%|vw|vh'),
    'no numeric-unit-only size detection may remain');
  assert(/function tokenizeFontValue/.test(src), 'a real CSS-font tokenizer must exist');
  assert(/function findSizeToken/.test(src), 'shorthand size location must use the tokenizer');
});

test('content-isolated.js NPO hook exposes no mask implementation source to the page', () => {
  const src = readFile('content-isolated.js');
  // The page-realm setter installed on the named-properties object must have
  // a neutral source: no mask identifiers, no conversion identifiers, no
  // blocked family names. The mask logic stays in the content world.
  assert(!/activeImpl/.test(src) && !/maskImpl/.test(src),
    'maskImpl/activeImpl identifiers must be gone from the injector');
  const hookStart = src.indexOf('function installStyleFontHook');
  const hookEnd = src.indexOf('function applyFontPatches');
  assert(hookStart >= 0 && hookEnd > hookStart, 'installStyleFontHook body must be extractable');
  const hook = src.slice(hookStart, hookEnd);
  for (const banned of ['fontMaskActive', 'rewriteFontSpec', 'containsBlockedFont', 'GeoMirrorFontMask']) {
    assert(!hook.includes(banned), `NPO hook page template must not contain ${banned}`);
  }
  // The setter the page can read is exactly a neutral delegation shim.
  assert(hook.includes('var fn = function (value) { return handler(this, value); };'),
    'the page-visible setter must be a neutral handler delegation');
  assert(hook.includes('var handler = function (target, value) { return origSet.call(target, convert(value)); };'),
    'the content-side conversion must be reached through a closure-only handler');
  assert(!hook.includes('String(value)'), 'no coercion/mask logic may appear in the page template');
});

test('F011 regression tests remain present in the suite', () => {
  const src = readFile('test/run-tests.js');
  // Count only the pre-round-2 part of the file: this test's own source also
  // contains the pattern strings and would otherwise count itself.
  const head = src.slice(0, src.indexOf('// FONT round 2 regressions'));
  const f011 = (head.split("test('F011: DNR Accept-Language").length - 1) +
    (head.split("test('F011: Accept-Language rule keeps").length - 1);
  eq(f011, 2, 'both F011 tests must still be registered');
  assert(src.includes('resourceTypes') && src.includes('AL_RULE_ID'), 'F011 assertions must still be wired');
});

test('font-mask-isolated hits CSS-escape spellings of blocked families', () => {
  const cases = [
    // simple escape (escaped space)
    ['16px Microsoft\\ YaHei, serif', '16px serif'],
    // hex escape with the optional terminating space consumed
    ['16px Microsoft\\20 YaHei, serif', '16px serif'],
    // hex escape inside a quoted string
    ['16px "\\4D icrosoft YaHei", serif', '16px serif'],
    ['16px "PingFang\\20 SC", monospace', '16px monospace'],
    // comment separator (with and without surrounding whitespace)
    ['16px Microsoft/**/ YaHei, serif', '16px serif'],
    ['16px Microsoft/**/YaHei, serif', '16px serif'],
    // 6-digit hex escape
    ['16px Microsoft\\000020YaHei, serif', '16px serif'],
    // hex escape without a terminator before a non-hex char
    ['16px "\\4Dicrosoft YaHei", serif', '16px serif'],
    // case-insensitive after decoding
    ['16px "MiCrOsOft\\20 YaHei", serif', '16px serif'],
  ];
  for (const [input, expected] of cases) {
    eq(FontMaskIso.rewriteFontSpec(input), expected);
    assert.strictEqual(FontMaskIso.containsBlockedFont(input), true, `contains must hit: ${input}`);
  }
});

test('font-mask-isolated does not misfire on escaped lookalikes or malformed escapes', () => {
  const unchanged = [
    '16px "Not Microsoft\\20 YaHei Custom", serif', // substring lookalike
    '16px "A\\2C B", serif',                        // escaped comma
    '16px "PingFang\\22 SC", monospace',             // escaped quote
    '16px Microsoft\\Z YaHei, serif',                // simple escape -> different name
    '16px "PingFang\\',                               // unterminated string
    '16px Microsoft\\',                               // trailing backslash at EOF
    '16px "Microsoft  YaHei", serif',                 // two real spaces = different family
  ];
  for (const input of unchanged) {
    eq(FontMaskIso.rewriteFontSpec(input), input, `must stay byte-identical: ${input}`);
    assert.strictEqual(FontMaskIso.containsBlockedFont(input), false, `must not hit: ${input}`);
  }
});

test('font-mask-isolated keeps shorthand components with escaped blocked families', () => {
  eq(FontMaskIso.rewriteFontSpec('italic small-caps bold medium/1.2 Microsoft\\20 YaHei, serif'),
    'italic small-caps bold medium/1.2 serif');
  eq(FontMaskIso.rewriteFontSpec('italic calc(12px + 1vw)/1.4 "PingFang\\20 SC", monospace'),
    'italic calc(12px + 1vw)/1.4 monospace');
  eq(FontMaskIso.rewriteFontSpec('italic clamp(1rem, 2vw, 2rem)/1.5 Microsoft\\ YaHei, sans-serif'),
    'italic clamp(1rem, 2vw, 2rem)/1.5 sans-serif');
  eq(FontMaskIso.rewriteFontSpec('italic bold 16px/1.5 "Microsoft\\ YaHei", serif'),
    'italic bold 16px/1.5 serif');
  // invalid code point 0 becomes U+FFFD: not a blocked family, stays verbatim
  eq(FontMaskIso.rewriteFontSpec('16px "Microsoft\\0 YaHei", serif'), '16px "Microsoft\\0 YaHei", serif');
});

test('escape fix keeps NPO neutrality and D-FONT/F011 closure intact', () => {
  const ci = readFile('content-isolated.js');
  assert(!/activeImpl|maskImpl/.test(ci), 'NPO mask identifiers must stay gone');
  assert(ci.includes('return handler(this, value)'), 'NPO setter must stay a neutral delegation');
  const tests = readFile('test/run-tests.js');
  const head = tests.slice(0, tests.indexOf('// FONT round 2 regressions'));
  const f011 = (head.split("test('F011: DNR Accept-Language").length - 1) +
    (head.split("test('F011: Accept-Language rule keeps").length - 1);
  eq(f011, 2, 'both F011 tests must still be registered');
  const lib = readFile('lib/font-mask-isolated.js');
  assert(!/SIZE_TOKEN/.test(lib), 'no incomplete size heuristic may return');
  assert(!/zz[0-9a-f]{12}/.test(lib + ci), 'no zz marker anywhere');
});

test('font-mask-isolated keeps quoted comment literals unmasked (round-4 comment context)', () => {
  // Inside a quoted string "/*...*/" is a literal character sequence, never
  // a comment separator: the whole name takes part in the exact match and
  // must stay byte-identical (Firefox native semantics).
  const unchanged = [
    '16px "Microsoft/**/YaHei", serif',
    '16px "Microsoft/*x*/YaHei", serif',
    '16px "Microsoft/**/ YaHei", serif',
    '16px "Not Microsoft/**/YaHei Custom", serif',
  ];
  for (const input of unchanged) {
    eq(FontMaskIso.rewriteFontSpec(input), input, `quoted comment must stay literal: ${input}`);
    assert.strictEqual(FontMaskIso.containsBlockedFont(input), false, `must not hit: ${input}`);
  }
});

test('font-mask-isolated masks unquoted comment separators like the equivalent escape', () => {
  // In unquoted position a comment is whitespace for the engine, so the
  // token sequence decodes to the blocked family and must be masked.
  const cases = [
    ['16px Microsoft/**/YaHei, serif', '16px serif'],
    ['16px Microsoft/*x*/YaHei, serif', '16px serif'],
    ['16px Microsoft/**/ YaHei, serif', '16px serif'],
    ['italic 16px Microsoft/**/YaHei, serif', 'italic 16px serif'],
    // Mixed list: the quoted literal stays, only the unquoted hit is removed.
    ['16px Microsoft/**/YaHei, "PingFang/*x*/SC", serif', '16px "PingFang/*x*/SC", serif'],
  ];
  for (const [input, expected] of cases) {
    eq(FontMaskIso.rewriteFontSpec(input), expected);
    assert.strictEqual(FontMaskIso.containsBlockedFont(input), true, `must hit: ${input}`);
  }
});

test('font-mask-isolated follows the engine for backslash+LF/CRLF/FF in both contexts', () => {
  // Escaped newline (LF/CRLF/FF per css-syntax-3) is a line continuation:
  // the name decodes to "MicrosoftYaHei", which is not blocked, so the
  // value stays byte-identical. Unquoted forms are natively rejected by
  // the engine; the extension must not rewrite them either.
  const unchanged = [
    '16px "Microsoft\\\nYaHei", serif',               // quoted, backslash+LF
    '16px "Microsoft\\\r\nYaHei", serif',             // quoted, backslash+CRLF
    '16px "Microsoft\\\fYaHei", serif',               // quoted, backslash+FF
    '16px Microsoft\\\nYaHei, serif',                 // unquoted, backslash+LF
    '16px Microsoft\\\r\nYaHei, serif',               // unquoted, backslash+CRLF
    '16px Microsoft\\\fYaHei, serif',                 // unquoted, backslash+FF
  ];
  for (const input of unchanged) {
    eq(FontMaskIso.rewriteFontSpec(input), input, `must stay byte-identical: ${JSON.stringify(input)}`);
    assert.strictEqual(FontMaskIso.containsBlockedFont(input), false, `must not hit: ${JSON.stringify(input)}`);
  }
});

test('round-4 comment fix keeps NPO neutrality and D-FONT/F011 closure intact', () => {
  const ci = readFile('content-isolated.js');
  assert(!/activeImpl|maskImpl/.test(ci), 'NPO mask identifiers must stay gone');
  assert(ci.includes('return handler(this, value)'), 'NPO setter must stay a neutral delegation');
  const tests = readFile('test/run-tests.js');
  const head = tests.slice(0, tests.indexOf('// FONT round 2 regressions'));
  const f011 = (head.split("test('F011: DNR Accept-Language").length - 1) +
    (head.split("test('F011: Accept-Language rule keeps").length - 1);
  eq(f011, 2, 'both F011 tests must still be registered');
  const lib = readFile('lib/font-mask-isolated.js');
  assert(!/SIZE_TOKEN/.test(lib), 'no incomplete size heuristic may return');
  assert(!/zz[0-9a-f]{12}/.test(lib + ci), 'no zz marker anywhere');
});
// ---------------------------------------------------------------------------
// F006 language-guard regressions (empty-storage host-language leak).
// ---------------------------------------------------------------------------

test('lang-guard: mergeProfile keeps the neutral bootstrap language while langEnabled is true and no override locale has arrived', () => {
  const src = readFile('content-isolated.js');
  const mStart = src.indexOf('function mergeProfile');
  const mEnd = src.indexOf('function loadFromStorage');
  assert(mStart >= 0 && mEnd > mStart, 'mergeProfile body must be extractable');
  const m = src.slice(mStart, mEnd);
  assert(/if \(merged\.langEnabled && !merged\.locale\) \{/.test(m),
    'the guard must fire exactly when langEnabled is true and the locale is missing');
  assert(/merged\.locale = \(base && base\.locale\) \|\| BOOTSTRAP_PROFILE\.locale;/.test(m),
    'locale must fall back to the previous profile or the neutral bootstrap');
  assert(/merged\.languages = \(base && base\.languages\) \|\| BOOTSTRAP_PROFILE\.languages;/.test(m),
    'languages must fall back symmetrically with locale');
  assert(/if \(merged\.tzEnabled && !merged\.timezone\) \{/.test(m),
    'the existing timezone guard must remain untouched');
  assert(/if \(merged\.langEnabled && !merged\.locale\) \{/.test(m) &&
    /merged\.tzEnabled && !merged\.timezone/.test(m),
    'the language guard must sit next to the timezone guard as its symmetric pair');
});

test('lang-guard: a real override locale always wins over the neutral bootstrap', () => {
  const src = readFile('content-isolated.js');
  const mStart = src.indexOf('function mergeProfile');
  const mEnd = src.indexOf('function loadFromStorage');
  const m = src.slice(mStart, mEnd);
  // The spread keeps next.locale; the guard is conditional on !merged.locale,
  // so a provided target locale can never be clobbered back to bootstrap.
  assert(/const merged = \{ \.\.\.base, \.\.\.next \};/.test(m),
    'the merge must keep the next-profile spread (target wins)');
  assert(!/merged\.locale = BOOTSTRAP_PROFILE\.locale;/.test(m) ||
    /if \(merged\.langEnabled && !merged\.locale\) \{/.test(m),
    'the bootstrap fallback must only ever be conditional');
});

test('lang-guard: langEnabled=false must not receive an injected locale (native delegation stays native)', () => {
  const src = readFile('content-isolated.js');
  const mStart = src.indexOf('function mergeProfile');
  const mEnd = src.indexOf('function loadFromStorage');
  const m = src.slice(mStart, mEnd);
  assert(/if \(merged\.langEnabled && !merged\.locale\) \{/.test(m),
    'the guard must be gated on langEnabled, so langEnabled=false never gets a locale injected');
  assert(/langActive\(\) \? cache\.locale : navLangDesc\.get\.call\(this\)/.test(src),
    'the language getter must keep its native delegation branch for langEnabled=false');
  assert(/if \(!langActive\(\)\) return navLangsDesc\.get\.call\(this\);/.test(src),
    'the languages getter must keep its native delegation branch for langEnabled=false');
});

test('lang-guard: BOOTSTRAP_PROFILE declares the neutral en-US language constants', () => {
  const src = readFile('content-isolated.js');
  assert(/locale: 'en-US'/.test(src), 'bootstrap locale must be neutral en-US');
  assert(/languages: \['en-US', 'en'\]/.test(src), 'bootstrap languages must be the neutral en-US list');
  assert(/langEnabled: true/.test(src), 'bootstrap must enable the language spoof by default');
});

// ---------------------------------------------------------------------------
// A1 watchPosition page-ID fit (positive monotonic page namespace).
// ---------------------------------------------------------------------------

test('A1: every fakeGeo watch returns a positive monotonic page id (no negative namespace)', () => {
  const src = readFile('content-isolated.js');
  const wpStart = src.indexOf('function watchPosition');
  const wpEnd = src.indexOf('function clearWatch');
  assert(wpStart >= 0 && wpEnd > wpStart, 'watchPosition body must be extractable');
  const wp = src.slice(wpStart, wpEnd);
  // The spoof branch allocates from the SAME positive counter as the
  // native-delegation branch — one document-level namespace.
  assert(/const id = \+\+watchCounter/.test(wp), 'the spoof branch must allocate a positive page id');
  assert(!/const id = -/.test(wp), 'no negative-id allocation may remain in watchPosition');
  assert(!/return nativeId/.test(wp), 'the internal native id must never be returned to the page');
});

test('A1: native-delegation watches map the internal native id to a fresh page id', () => {
  const src = readFile('content-isolated.js');
  const wpStart = src.indexOf('function watchPosition');
  const wpEnd = src.indexOf('function clearWatch');
  const wp = src.slice(wpStart, wpEnd);
  assert(/const nativeId = delegateGeo\(realWP, realGeo, success, error, options, argCount\)/.test(wp),
    'the disabled branch must still obtain the internal native id');
  assert(/watchSources\.set\(id, \{ source: 'native', nativeId \}\)/.test(wp),
    'the internal id must be stored ONLY in the mapping under the fresh page id');
  assert(/return id;/.test(wp), 'the disabled branch must return the page id');
  assert(!/watchSources\.set\(nativeId/.test(wp), 'the mapping must never be keyed by the internal native id');
});

test('A1: clearWatch translates page ids, forwards internal native ids, and no-ops unknown ids', () => {
  const src = readFile('content-isolated.js');
  const cwStart = src.indexOf('function clearWatch');
  const cwEnd = src.indexOf('function applyGeolocation');
  const cw = src.slice(cwStart, cwEnd);
  assert(/if \(!entry\) return undefined/.test(cw), 'unknown or already-cleared ids must be a no-op');
  assert(/watchSources\.delete\(id\)/.test(cw), 'a resolved page id must be removed from the mapping exactly once');
  assert(/entry\.source === 'spoof'/.test(cw), 'spoof entries must not reach the native clearWatch');
  assert(/Reflect\.apply\(realCW, realGeo, \[entry\.nativeId\]\)/.test(cw),
    'native page ids must clear via the INTERNAL native id');
  assert(!/realCW, realGeo, \[id\]/.test(cw), 'the page id must never be forwarded to the native clearWatch directly');
});

test('A1: storage.onChanged replay iterates the mapping and fires spoof handlers only', () => {
  const src = readFile('content-isolated.js');
  assert(/for \(const entry of watchSources\.values\(\)\)/.test(src),
    'replay must iterate the unified mapping');
  assert(/if \(entry\.source === 'spoof'\) \{ try \{ entry\.handler\(\); \} catch/.test(src),
    'replay must fire spoof handlers only (native entries have no handler)');
  assert(!/watchHandlers/.test(src), 'the old separate handler table must be gone');
});

test('P4: spoofed positions/coords are zero-own-property objects over the native prototypes', () => {
  const src = readFile('content-isolated.js');
  assert(/const coords = makePageFn\('coordProto', 'return Object\.create\(coordProto\);'\)\(coordProto\)/.test(src) &&
    /const pos = makePageFn\('posProto', 'return Object\.create\(posProto\);'\)\(posProto\)/.test(src),
    'both objects must be page-realm constructed over the native prototypes');
  assert(!/ro\(coords,/.test(src) && !/ro\(pos,/.test(src),
    'position/coords must carry NO own accessors (zero own properties)');
  assert(!/window\.(posData|coordData)|globalThis\.(posData|coordData)/.test(src),
    'the WeakMaps must never be exposed on a page global');
});

test('P4: position/coords values live in isolated-side WeakMaps keyed by the RAW object', () => {
  const src = readFile('content-isolated.js');
  assert(/const posData = new WeakMap\(\);/.test(src) && /const coordData = new WeakMap\(\);/.test(src),
    'two isolated-side WeakMaps must exist');
  assert(/coordData\.set\(ckey, \{ latitude: lat, longitude: lon, accuracy: acc,/.test(src) &&
    /posData\.set\(pkey, \{ coords: ckey, timestamp: ts \}\);/.test(src),
    'values must be registered under the canonical raw keys');
  assert(/function geoKey\(instance\)/.test(src) &&
    /if \(instance && instance\.wrappedJSObject\) return instance\.wrappedJSObject;/.test(src),
    'key derivation must unwrap Xray wrappers to the single raw object');
  assert(/const ckey = geoKey\(coords\);/.test(src) && /const pkey = geoKey\(pos\);/.test(src),
    'the registration keys must come from the canonical geoKey derivation');
});

test('P4: prototype getter dispatchers replace the captured native accessors once per document', () => {
  const src = readFile('content-isolated.js');
  assert(/function installPositionDispatchers\(\)/.test(src), 'dispatcher installer must exist');
  assert(/for \(const p of \['coords', 'timestamp'\]\)/.test(src) &&
    /for \(const p of \['latitude', 'longitude', 'accuracy', 'altitude',/.test(src),
    'the 2 position accessors and the 7 coords accessors must all be installed');
  assert(/Object\.defineProperty\(proto, prop, Object\.assign\(\{\}, d, \{\s*get: pageDispatcher\(impl, 'get ' \+ prop\),\s*\}\)\)/.test(src),
    'flags must derive from the captured native descriptor, never hand-built');
  assert(/const impl = exportFunction\(function \(\) \{\s*const k = geoKey\(this\);/.test(src),
    'the getter implementation must be an isolated-side exportFunction closure');
});

test('P4: toJSON dispatchers return page-realm dictionaries in native field order', () => {
  const src = readFile('content-isolated.js');
  assert(/return \{ coords: coords, timestamp: ts \};/.test(src),
    'position toJSON must return {coords, timestamp} in native order');
  assert(/return \{ latitude: lat, longitude: lon, altitude: alt, accuracy: acc, /.test(src) &&
    /altitudeAccuracy: aa, heading: h, speed: s \};/.test(src),
    'coords toJSON must return the 7 fields in native order');
  assert(/makePageFn\('coords', 'ts',/.test(src) &&
    /makePageFn\('lat', 'lon', 'alt', 'acc', 'aa', 'h', 's',/.test(src),
    'dictionaries must be page-realm constructed');
});

test('P4: native miss delegation re-applies the captured accessor to the RAW receiver so the WebIDL binding decides', () => {
  const src = readFile('content-isolated.js');
  assert(/const k = geoKey\(this\);/.test(src) && /const e = dataMap\.get\(k\);/.test(src) &&
    /if \(e !== undefined\) return e\[prop\];/.test(src) &&
    /return Reflect\.apply\(origGet, k, \[\]\);/.test(src),
    'getter miss must delegate to the captured native getter with the RAW key as receiver');
  assert(/return Reflect\.apply\(origPosToJSON, k, \[\]\);/.test(src) &&
    /return Reflect\.apply\(origCoordToJSON, k, \[\]\);/.test(src),
    'toJSON miss must delegate to the captured native toJSON with the RAW key as receiver');
});

test('P4: dispatchers install on every document before page scripts can observe spoofed positions', () => {
  const src = readFile('content-isolated.js');
  assert(/installPositionDispatchers\(\);/.test(src),
    'installer must be invoked in the geolocation bootstrap');
  assert(/BEFORE any page script can observe a spoofed position/.test(src),
    'install must be documented as document-scoped pre-observation');
});

test('P4: structuredClone/DataCloneError are NOT faked (accepted WebIDL internal-slot limitation)', () => {
  const src = readFile('content-isolated.js');
  assert(!/structuredClone/.test(src),
    'no structuredClone patch may exist — the DataCloneError residue is an accepted LIMITATION');
  assert(!/DataCloneError/.test(src),
    'no DataCloneError fabrication may exist');
});

test('P4: READONLY_ACC own-accessor builder is retained ONLY for GeolocationPositionError', () => {
  const src = readFile('content-isolated.js');
  assert(/const READONLY_ACC = 'var ro = function \(o, prop, value\)/.test(src),
    'READONLY_ACC must still exist for PositionError');
  assert(/ro\(e, "code", code\); ro\(e, "message", message\);/.test(src),
    'PositionError code/message stay hand-built own attributes');
  assert(!/ro\(coords,/.test(src) && !/ro\(pos,/.test(src),
    'position/coords must not use the own-accessor builder');
});


if (process.exitCode) {
  console.error('\nTests failed.');
  process.exit(process.exitCode);
} else {
  console.log(`\n${passed} tests passed.`);
}
