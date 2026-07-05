/* GeoMirror — MAIN-world injector.
 *
 * Runs in the page's main world at document_start, before page scripts, so every
 * override is visible to them. It spoofs three surfaces so the page sees a single
 * consistent "user" matching the exit IP:
 *
 *   1. navigator.geolocation            — residential coordinate near exit IP
 *   2. Date timezone + Intl timeZone    — Asia/Tokyo etc. (getTimezoneOffset,
 *                                         resolvedOptions().timeZone, default tz)
 *   3. navigator.language / Intl locale — ja-JP etc. (navigator.language(s) +
 *                                         Intl default locale)
 *
 * Data arrives asynchronously via <html data-geomirror> (written by the isolated
 * bridge). Geolocation callbacks and tz/lang reads are simply held until ready —
 * invisible to pages. The outgoing Accept-Language *header* is handled in the
 * background worker via declarativeNetRequest (JS can't touch request headers).
 *
 * All apply helpers are bidirectional: when a spoof switch flips off on an
 * already-open page, the original function/descriptor is restored in place, so
 * no patched API stays stuck until refresh. Repeated storage mutations re-apply
 * from the captured originals, so wrappers never stack.
 *
 * Spoofed functions keep toString() === "function name() { [native code] }".
 */
(function () {
  const HTML = document.documentElement;
  if (!HTML) return;

  // ---------------------------------------------------------------------------
  // Capture real APIs before shadowing. Every apply helper builds wrappers from
  // these captured originals (never from the currently-installed value), so
  // repeated toggle events never nest wrappers. When a surface is inactive we
  // assign the captured original back, fully undoing the patch.
  // ---------------------------------------------------------------------------
  let realGeo = null;
  try { realGeo = navigator.geolocation; } catch (_) {}
  const realDTF = Intl.DateTimeFormat;
  const realNumFmt = Intl.NumberFormat;
  const realCol = Intl.Collator;
  const realTZO = Date.prototype.getTimezoneOffset;

  let realPermQuery = null;
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      realPermQuery = navigator.permissions.query;
    }
  } catch (_) {}

  // navigator.language / navigator.languages live on Navigator.prototype in
  // modern browsers. We patch them by defining an own accessor on the instance
  // (which shadows the prototype data property). To restore, we just delete the
  // own accessor and the prototype property shows through again. We track
  // whether we successfully patched so restoration is a no-op when there was
  // nothing to undo.
  let langPatched = false;

  let cache = null;
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  function loadFromDOM() {
    const attr = HTML.getAttribute('data-geomirror');
    if (!attr) return;
    let next = null;
    try { next = JSON.parse(attr); } catch (_) { return; }
    if (next && next.lat != null && next.lon != null) {
      cache = next;
      if (readyResolve) { readyResolve(); readyResolve = null; }
    } else if (next) {
      // tz/lang may be valid even if coords aren't ready yet; keep what we can.
      cache = { ...cache, ...next };
      if (cache && (cache.tzEnabled || cache.langEnabled) && readyResolve) {
        readyResolve(); readyResolve = null;
      }
    }
  }
  loadFromDOM();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Make a spoofed function report as native to defeat toString() sniffing.
  function nativize(fn, name) {
    const native = `function ${name}() { [native code] }`;
    try { Object.defineProperty(fn, 'name', { value: name }); } catch (_) {}
    try { Object.defineProperty(fn, 'toString', { value: () => native }); } catch (_) {}
    try { fn.toString.toString = () => 'function toString() { [native code] }'; } catch (_) {}
    return fn;
  }

  function defineGetter(obj, prop, get) {
    try {
      Object.defineProperty(obj, prop, {
        configurable: true, enumerable: true, get,
      });
      return true;
    } catch (_) { return false; }
  }

  // Compute the offset (in minutes, JS sign convention) for an IANA timezone at
  // a given UTC instant, DST-aware via Intl. JS getTimezoneOffset returns
  // (UTC − local) in minutes, i.e. the negation of the UTC offset, so a UTC+9
  // zone yields −540 and UTC−7 yields +420.
  function tzOffsetMinutes(timeZone, date) {
    if (window.GeoMirrorTZ && window.GeoMirrorTZ.tzOffsetMinutes) {
      return window.GeoMirrorTZ.tzOffsetMinutes(timeZone, date);
    }
    return null;
  }

  function tzActive() {
    return !!(cache && cache.tzEnabled && cache.timezone);
  }

  function langActive() {
    return !!(cache && cache.langEnabled && cache.locale);
  }

  // Location/geolocation spoof is considered active when the master enabled
  // flag is on. Used to gate the geolocation permission spoof.
  function geoActive() {
    return !!(cache && cache.enabled !== false);
  }

  // ---------------------------------------------------------------------------
  // Geolocation override
  //
  // The fake geolocation object is always installed on navigator.geolocation.
  // Its methods delegate to realGeo whenever spoofing is disabled, so toggling
  // the switch on an already-open page immediately routes to the real browser
  // geolocation without needing to swap navigator.geolocation back and forth.
  // ---------------------------------------------------------------------------
  const watchHandlers = {};
  let watchCounter = 0;

  function buildPosition() {
    const jitter = (Math.random() - 0.5) * 8; // a few meters of per-call variance
    return {
      coords: {
        latitude: cache.lat,
        longitude: cache.lon,
        accuracy: Math.max(1, cache.acc + jitter),
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
  }

  function isGeoDisabled() { return !geoActive(); }

  function getCurrentPosition(success, error, options) {
    if (typeof success !== 'function') {
      throw new TypeError("Failed to execute 'getCurrentPosition' on 'Geolocation': 1 argument required");
    }
    if (isGeoDisabled() && realGeo) {
      try { return realGeo.getCurrentPosition(success, error, options); } catch (_) {}
    }
    ready.then(() => {
      if (isGeoDisabled() && realGeo) {
        try { return realGeo.getCurrentPosition(success, error, options); } catch (_) {}
      }
      if (!cache || cache.lat == null) {
        if (typeof error === 'function') error({ code: 2, message: 'Position unavailable' });
        return;
      }
      success(buildPosition());
    });
  }

  function watchPosition(success, error, options) {
    if (typeof success !== 'function') {
      throw new TypeError("Failed to execute 'watchPosition' on 'Geolocation': 1 argument required");
    }
    getCurrentPosition(success, error, options);
    const id = ++watchCounter;
    watchHandlers[id] = () => { if (!isGeoDisabled() && cache && cache.lat != null) success(buildPosition()); };
    return id;
  }

  function clearWatch(id) { delete watchHandlers[id]; }

  const fakeGeo = { getCurrentPosition, watchPosition, clearWatch };
  nativize(getCurrentPosition, 'getCurrentPosition');
  nativize(watchPosition, 'watchPosition');
  nativize(clearWatch, 'clearWatch');

  try {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => fakeGeo });
  } catch (_) {
    try { navigator.geolocation = fakeGeo; } catch (__) {}
  }

  // ---------------------------------------------------------------------------
  // Permissions override
  //
  // Spoofs navigator.permissions.query for { name: 'geolocation' } ONLY while
  // location spoofing is active. When location spoof is off, the real query is
  // restored so pages see the true browser permission state.
  // ---------------------------------------------------------------------------
  function applyPermissions() {
    if (!realPermQuery) return;
    if (!geoActive() && cache) {
      try { navigator.permissions.query = realPermQuery; } catch (_) {}
      return;
    }
    // Already wrapped by a previous apply? realPermQuery is the captured
    // original, so assigning it back above then re-wrapping here never nests.
    // If page scripts query before the storage bridge publishes the first
    // payload, hold the geolocation permission answer until `ready` resolves
    // instead of leaking the real permission state.
    const wrapped = function query(desc) {
      if (desc && desc.name === 'geolocation') {
        if (!cache) {
          return ready.then(() => (geoActive()
            ? { state: 'granted', onchange: null }
            : realPermQuery.call(navigator.permissions, desc)));
        }
        return Promise.resolve({ state: 'granted', onchange: null });
      }
      return realPermQuery.call(navigator.permissions, desc);
    };
    nativize(wrapped, 'query');
    try { navigator.permissions.query = wrapped; } catch (_) {}
  }
  applyPermissions();

  // ---------------------------------------------------------------------------
  // Timezone override
  //
  // Patches Date.prototype.getTimezoneOffset when active; restores the original
  // method when inactive. Intl.DateTimeFormat is handled together with the
  // language surface below (both can wrap DTF), so this function only owns the
  // Date method.
  // ---------------------------------------------------------------------------
  function applyTimezoneOffset() {
    if (!tzActive()) {
      try { Date.prototype.getTimezoneOffset = realTZO; } catch (_) {}
      return;
    }
    const tz = cache.timezone;
    const fakeTZO = function getTimezoneOffset() {
      return tzOffsetMinutes(tz, this);
    };
    nativize(fakeTZO, 'getTimezoneOffset');
    try { Date.prototype.getTimezoneOffset = fakeTZO; } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Intl.DateTimeFormat — touched by both timezone (injects timeZone option)
  // and language (substitutes default locale) spoofing. Built from realDTF
  // (captured original) on every apply, so toggling either switch on/off on an
  // already-open page re-derives the correct wrapper without stacking.
  // ---------------------------------------------------------------------------
  function applyIntlDateTimeFormat() {
    const wantTz = tzActive();
    const wantLang = langActive();
    if (!wantTz && !wantLang) {
      try { Intl.DateTimeFormat = realDTF; } catch (_) {}
      return;
    }
    const tz = wantTz ? cache.timezone : null;
    const loc = wantLang ? cache.locale : null;
    const wrappedDTF = function DateTimeFormat() {
      const args = arguments;
      let localeArg = args[0];
      let optionsArg = args[1];
      // DateTimeFormat() / DateTimeFormat(options)
      if (typeof localeArg === 'object' && localeArg !== null && !Array.isArray(localeArg) && optionsArg === undefined) {
        optionsArg = localeArg; localeArg = undefined;
      }
      const opts = (optionsArg && typeof optionsArg === 'object') ? Object.assign({}, optionsArg) : {};
      if (wantTz && opts.timeZone === undefined) opts.timeZone = tz;
      if (localeArg === undefined && wantLang) localeArg = loc;
      if (localeArg === undefined) return new realDTF(undefined, opts);
      return new realDTF(localeArg, opts);
    };
    wrappedDTF.prototype = realDTF.prototype;
    wrappedDTF.supportedLocalesOf = realDTF.supportedLocalesOf.bind(realDTF);
    nativize(wrappedDTF, 'DateTimeFormat');
    try { Intl.DateTimeFormat = wrappedDTF; } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Intl.NumberFormat / Intl.Collator — patched only for language spoofing.
  // When language spoof is off, the captured original constructor is restored.
  // ---------------------------------------------------------------------------
  function applyIntlCtor(realCtor, name) {
    if (!realCtor) return;
    if (!langActive()) {
      try { Intl[name] = realCtor; } catch (_) {}
      return;
    }
    const locale = cache.locale;
    const wrapped = function () {
      if (arguments.length === 0) return new realCtor(locale);
      if (arguments.length === 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {
        return new realCtor(locale, arguments[0]);
      }
      return new (Function.prototype.bind.apply(realCtor, [null].concat(Array.from(arguments))))();
    };
    wrapped.prototype = realCtor.prototype;
    if (realCtor.supportedLocalesOf) {
      wrapped.supportedLocalesOf = realCtor.supportedLocalesOf.bind(realCtor);
    }
    nativize(wrapped, name);
    try { Intl[name] = wrapped; } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // navigator.language / navigator.languages — patched via an own accessor on
  // the instance that shadows the prototype data property. Restoration deletes
  // the own accessor (configurable: true) so the prototype property shows
  // through again. If the browser refused the original patch, langPatched
  // stays false and restoration is a no-op.
  // ---------------------------------------------------------------------------
  function applyNavigatorLanguage() {
    if (!langActive()) {
      if (langPatched) {
        try { delete navigator.language; } catch (_) {}
        try { delete navigator.languages; } catch (_) {}
        langPatched = false;
      }
      return;
    }
    const locale = cache.locale;
    const languages = (cache.languages && cache.languages.length) ? cache.languages : [locale];
    const okLang = defineGetter(navigator, 'language', () => locale);
    const okLangs = defineGetter(navigator, 'languages', () => languages.slice());
    if (okLang || okLangs) langPatched = true;
  }

  function applyAll() {
    applyTimezoneOffset();
    applyIntlDateTimeFormat();
    applyIntlCtor(realNumFmt, 'NumberFormat');
    applyIntlCtor(realCol, 'Collator');
    applyNavigatorLanguage();
    applyPermissions();
  }

  ready.then(applyAll);

  // ---------------------------------------------------------------------------
  // Live updates: bridge republishes -> refresh cache and re-fire watches.
  // applyAll() runs in both directions (apply + restore) on every change.
  // ---------------------------------------------------------------------------
  const obs = new MutationObserver(() => {
    loadFromDOM();
    applyAll();
    Object.keys(watchHandlers).forEach((id) => { try { watchHandlers[id](); } catch (_) {} });
  });
  obs.observe(HTML, { attributes: true, attributeFilter: ['data-geomirror'] });

  // Safety net: don't keep pending geolocation callbacks hanging forever.
  setTimeout(() => { if (readyResolve) { readyResolve(); readyResolve = null; } }, 12000);
})();
