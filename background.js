/* GeoMirror — background service worker.
 *
 * Responsibilities:
 *  - Detect the exit-IP geolocation (through the user's proxy).
 *  - Pick a nearby residential street as the override coordinate.
 *  - Resolve the exit IP's timezone (already returned by the IP providers) and
 *    infer a matching locale (country code → language, timezone as tie-breaker).
 *  - Store everything so the content scripts can apply it to every page.
 *  - Push an Accept-Language header rule via declarativeNetRequest so the
 *    *outgoing* HTTP header matches the spoofed language, not just navigator.
 *  - Refresh on install / startup and on demand (one-tap re-detect).
 */
// Chrome MV3 loads the background as a service worker and needs importScripts
// to pull in lib/*. Firefox MV3 loads background.scripts (declared in
// manifest.firefox.json) directly into an event page, where importScripts is
// not available. Guard so the same source file works in both runtimes.
if (typeof importScripts === 'function') {
  importScripts('lib/geo.js', 'lib/providers.js', 'lib/locale.js');
}

const DEFAULT_SETTINGS = {
  enabled: true,
  accuracyM: 30,          // reported accuracy in meters (GPS-like)
  refreshMinutes: 360,    // re-detect every 6h
  ipToken: '',            // optional ipinfo.io token for better fallback
  tzEnabled: true,        // spoof Date/Intl timezone to match exit IP
  langEnabled: true,      // spoof navigator.language / Intl locale + Accept-Language header
  fontEnabled: true,      // mask Chinese regional fonts for non-Chinese exit profiles
};

const ALARM = 'refresh';
const AL_RULE_ID = 9001; // dynamic declarativeNetRequest rule id for Accept-Language
let lastDnrError = null; // last updateDynamicRules rejection, for honest error state

// Chromium's declarativeNetRequest resourceTypes has no 'beacon' — it names
// the same sendBeacon traffic 'ping' — and rejects any rule that mentions
// 'beacon', so the 1.2.3 rule silently never installed on Chrome/Edge.
// Chrome 151+ also exposes a `browser` namespace, so the namespace itself
// cannot identify Firefox; use the Firefox-only runtime.getBrowserInfo API
// instead (present in Firefox on both the chrome and browser namespaces).
const _RT = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime
          : (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime
          : null;
const AL_BEACON_TYPE = (_RT && typeof _RT.getBrowserInfo === 'function') ? 'beacon' : 'ping';

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function patchState(patch) {
  const { state } = await chrome.storage.local.get('state');
  await chrome.storage.local.set({ state: { ...(state || {}), ...patch } });
}

function alRule(al) {
  return {
    id: AL_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'accept-language', operation: 'set', value: al },
      ],
    },
    condition: {
      urlFilter: '*',
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', AL_BEACON_TYPE],
    },
  };
}

/**
 * Push / clear the dynamic Accept-Language rule as ONE atomic
 * updateDynamicRules call (remove + add together: either both land or
 * neither does, so a rejection can never leave the rule table half-updated).
 * Transient rejections are retried (3 attempts, 500ms/1000ms backoff).
 * Returns true when the rule table matches the requested state; on failure
 * records the reason in lastDnrError for an honest error state.
 */
async function syncHeaderRule(settings, override) {
  lastDnrError = null;
  if (!chrome.declarativeNetRequest) {
    lastDnrError = 'declarativeNetRequest API unavailable';
    return false;
  }
  const update = { removeRuleIds: [AL_RULE_ID] };
  if (settings && settings.langEnabled) {
    const al = override && override.acceptLanguage;
    if (al) update.addRules = [alRule(al)]; // nothing to enforce yet without a value
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules(update);
      return true;
    } catch (e) {
      lastDnrError = String((e && e.message) || e);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return false;
}

/**
 * Coherent language failure handling: while language spoofing cannot be
 * backed by its header rule, the override must not claim a language either.
 * Strip the language fields so the page language stays consistent with the
 * real outgoing header, and surface the failure in the internal state
 * (popup shows the error instead of a silent "Active").
 */
function stripLanguage(override) {
  if (!override) return;
  override.locale = null;
  override.languages = null;
  override.acceptLanguage = null;
  override.langEnabled = false;
}

/**
 * Parse a project-generated Accept-Language header into the FULL ordered
 * list of its language ranges: strip ;q= weights, trim whitespace, keep
 * source order. Only the project's own legal header shape is accepted —
 * comma-separated BCP-47-ish tags, each optionally followed by a single
 * ;q= weight (e.g. "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7" -> ['fr-FR','fr',
 * 'en-US','en']). Returns null when the header is not a legal shape or
 * yields no tag; callers must then NOT claim a retained language state.
 */
function alLanguageList(al) {
  if (typeof al !== 'string') return null;
  const tags = [];
  for (const raw of al.split(',')) {
    const seg = raw.trim();
    if (!seg) return null; // empty range: not a legal project header
    const semi = seg.indexOf(';');
    const tagPart = (semi === -1 ? seg : seg.slice(0, semi)).trim();
    if (!/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(tagPart)) return null;
    if (semi !== -1) {
      const qPart = seg.slice(semi + 1).trim();
      if (!/^q=(0(\.\d{0,3})?|1(\.0{0,3})?|\.\d{1,3})$/i.test(qPart)) return null;
    }
    tags.push(tagPart);
  }
  return tags.length ? tags : null;
}

/**
 * Handle a REJECTED header-rule update so the page commit state matches the
 * ACTUAL dynamic rule table (the header the server really receives), never
 * the intended target and never a guess:
 *  - rule 9001 still present -> commit the override to the rule's ACTUAL
 *    value: locale = first tag, languages = the FULL ordered tag list of
 *    the live header (never the single-item ['first'] shape), acceptLanguage
 *    = the live header, langEnabled stays true: the old region remains,
 *    page language == real header, and the failure is surfaced (popup
 *    error, not Active). A live header that is not a legal project shape
 *    must NOT be claimed as retained: keep the previous committed state
 *    and report an explicit unreadable error.
 *  - rule 9001 absent -> strip the language fields: page native == header
 *    native, failure surfaced.
 *  - rule table unreadable -> keep the override UNCHANGED and surface an
 *    explicit unreadable-table error: an atomic rejection leaves the table
 *    exactly as the last successful commit, so the override still matches
 *    it; stripping could CREATE the page/header mismatch this handler
 *    exists to prevent.
 * This is the ONLY failure handler for syncHeaderRule rejections
 * (refresh / onStartup / language toggle / settings re-assert all route
 * through it). Returns the outcome for callers.
 */
async function handleRuleFailure(override, context) {
  let outcome = 'unreadable';
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const nine = (rules || []).find((r) => r.id === AL_RULE_ID);
    if (nine) {
      const hdr = (((nine.action || {}).requestHeaders) || []).find((h) => h.header === 'accept-language');
      const actual = hdr && hdr.value;
      if (override && actual) {
        const tags = alLanguageList(actual);
        if (tags) {
          override.acceptLanguage = actual;
          override.locale = tags[0];
          override.languages = tags;
          override.langEnabled = true;
          outcome = 'retained';
        } else {
          // Rule value is not a legal project header: claiming retained
          // would lie about the page language. Keep the previous committed
          // state and surface an explicit unreadable error.
          outcome = 'unreadable';
        }
      } else {
        outcome = 'unreadable';
      }
    } else {
      stripLanguage(override);
      outcome = 'stripped';
    }
  } catch (e) {
    outcome = 'unreadable';
  }
  const err = 'Accept-Language rule update failed: ' + (lastDnrError || 'unknown reason')
    + (context ? ' (' + context + ')' : '') + ' [' + outcome + ']';
  await patchState({
    status: 'error',
    langFailed: true,
    lastError: err,
    lastUpdated: Date.now(),
  });
  return { outcome, lastError: err };
}

async function refresh() {
  await patchState({ status: 'refreshing', lastError: null });
  const s = await getSettings();
  try {
    const ip = await IPLoc.getIPLocation(s.ipToken);
    if (!ip || ip.lat == null) throw new Error('All IP geolocation providers failed.');

    const pick = await GeoUtil.chooseResidential(ip.lat, ip.lon, {
      radius: 2500, limit: 150, timeoutMs: 12000,
    });
    const addr = await IPLoc.getDisplayAddress(pick.lat, pick.lon);
    const now = Date.now();

    // getIPLocation prefers a provider result with an IANA timezone and only
    // returns a location-only fallback when all timezone-capable providers fail.
    // The MAIN-world injector keeps its neutral bootstrap in that rare case
    // instead of leaking the host timezone.
    const timezone = ip.timezone || null;
    const loc = Locale.localeFor(ip.countryCode, timezone);

    const override = {
      lat: pick.lat, lon: pick.lon, acc: s.accuracyM,
      source: pick.source, road: pick.road || null,
      enabled: s.enabled, ts: now,
      timezone,
      tzEnabled: s.tzEnabled,
      langEnabled: s.langEnabled,
      fontEnabled: s.fontEnabled,
      locale: loc ? loc.language : null,
      languages: loc ? loc.languages : null,
      acceptLanguage: loc ? loc.acceptLanguage : null,
    };
    const state = {
      status: 'ok',
      langFailed: false,
      ip: ip.ip, ipCity: ip.city, ipRegion: ip.region,
      ipCountry: ip.country, ipCountryCode: ip.countryCode,
      ipLat: ip.lat, ipLon: ip.lon, isp: ip.isp, provider: ip.provider,
      ipTimezone: timezone,
      ipLocale: loc ? loc.language : null,
      overrideLat: pick.lat, overrideLon: pick.lon,
      overrideSource: pick.source, overrideRoad: pick.road || null,
      overrideAddress: addr ? addr.text : '',
      lastUpdated: now, lastError: null,
    };
    // The header rule is the commit point for the language spoof: if it
    // cannot be applied, the override must commit to the ACTUAL rule table
    // (a retained old rule keeps its language; a truly absent rule means
    // native), never to the intended target — page and real header stay
    // coherent, and the failure is surfaced.
    const ruleOk = await syncHeaderRule(s, override);
    if (!ruleOk) {
      const h = await handleRuleFailure(override, 'refresh');
      state.status = 'error';
      state.langFailed = true;
      state.lastError = h.lastError;
    }
    await chrome.storage.local.set({ override, state });
  } catch (e) {
    await patchState({
      status: 'error',
      lastError: String((e && e.message) || e),
      lastUpdated: Date.now(),
    });
  }
}

async function ensureAlarm() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { periodInMinutes: Math.max(1, s.refreshMinutes) });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await ensureAlarm();
  await refresh();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  const { state, override, settings } = await chrome.storage.local.get(['state', 'override', 'settings']);
  // Re-assert the header rule on startup (dynamic rules don't persist a value
  // we control across browser restarts in all cases). If the re-assert fails,
  // commit the override to the ACTUAL rule table (retained old rule -> keep
  // its language; absent -> native) so the page never diverges from the
  // header the server actually receives after the restart.
  const ruleOk = await syncHeaderRule({ ...DEFAULT_SETTINGS, ...(settings || {}) }, override);
  if (!ruleOk) {
    await handleRuleFailure(override, 'startup re-assert');
    if (override) {
      await chrome.storage.local.set({ override });
    }
  }
  const s = await getSettings();
  const age = state && state.lastUpdated ? Date.now() - state.lastUpdated : Infinity;
  if (!state || age > s.refreshMinutes * 60000) await refresh();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refresh();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'REFRESH') {
      await refresh();
    } else if (msg && msg.type === 'SET_SETTINGS') {
      const patch = msg.patch || {};
      const savedPatch = { ...patch };
      let toggleFailed = false;
      if ('langEnabled' in patch) {
        // Language toggle: the header rule is the commit point. Try the
        // TARGET rule state first; if it fails, do NOT flip the language
        // setting — rule table and setting stay coherent (both unchanged),
        // the override commits to the ACTUAL rule table (retained old rule
        // keeps its language; absent -> native), and the failure is
        // surfaced instead of silently swallowed.
        const cur = await getSettings();
        const { override } = await chrome.storage.local.get('override');
        const ok = await syncHeaderRule({ ...cur, ...patch }, override || {});
        if (!ok) {
          delete savedPatch.langEnabled;
          toggleFailed = true;
          await handleRuleFailure(override || {}, 'language toggle');
          if (override) {
            await chrome.storage.local.set({ override });
          }
        }
      }
      const next = await saveSettings(savedPatch);
      const { override } = await chrome.storage.local.get('override');
      if (override) {
        override.enabled = next.enabled;
        override.acc = next.accuracyM;
        override.tzEnabled = next.tzEnabled;
        // A failed toggle already committed langEnabled to the ACTUAL rule
        // table; the settings-derived value must not overwrite it.
        if (!toggleFailed) override.langEnabled = next.langEnabled;
        override.fontEnabled = next.fontEnabled;
        await chrome.storage.local.set({ override });
      }
      if (!('langEnabled' in patch)) {
        // Toggling other settings re-asserts the header rule (unchanged
        // behavior); a failure here means the rule table is broken — commit
        // the override to the ACTUAL table and report instead of silently
        // diverging.
        const ok = await syncHeaderRule(next, override);
        if (!ok) {
          await handleRuleFailure(override || {}, 'settings re-assert');
          if (override) {
            await chrome.storage.local.set({ override });
          }
        }
      }
      if (msg.patch && 'refreshMinutes' in msg.patch) await ensureAlarm();
    }
    // Return a fresh snapshot for any message (covers GET_STATE too).
    const { state, override, settings } = await chrome.storage.local.get(['state', 'override', 'settings']);
    sendResponse({ state, override, settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
  })();
  return true; // keep channel open for async sendResponse
});
