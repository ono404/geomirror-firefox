/* GeoMirror — Firefox ISOLATED-world font mask helpers.
 *
 * Firefox-only variant of lib/font-mask.js for the isolated-world injector.
 * Differences from the shared module:
 *  - No sentinel/random family of any kind: the conversion removes blocked
 *    regional families from the assigned value, keeps the ordinary fallbacks
 *    already present in the input, and uses a standard CSS generic family
 *    only when nothing remains. No family is ever invented.
 *  - Blocked-family matching is EXACT: only a family whose whole name (after
 *    unquoting, case-insensitive) is a blocked regional family is removed.
 *    Families that merely contain a blocked name as a substring are
 *    ordinary families and are preserved.
 *  - Font shorthand values are converted by tokenizing the value with a
 *    small CSS-font grammar (size keywords, calc()/clamp()/var() functions,
 *    quoted strings, top-level commas) and deleting ONLY the blocked family
 *    tokens from the family-list tail; every other token (style / variant /
 *    weight / stretch / size / line-height and the fallback families) is
 *    preserved verbatim from the input string.
 *  - No window/global writes. Runs in the isolated world; the top-level const
 *    is only visible to sibling content scripts of the same extension, never
 *    to the page.
 */
'use strict';

const GeoMirrorFontMask = (() => {
  const BLOCKED_FONT_FAMILIES = [
    // macOS / Windows Chinese fonts
    'PingFang SC', 'PingFang TC', 'PingFang HK',
    'Hiragino Sans GB', 'STHeiti', 'STSong', 'STKaiti', 'STFangsong',
    'Heiti SC', 'Heiti TC', 'Songti SC', 'Songti TC',
    'Kaiti SC', 'Kaiti TC', 'Yuanti SC',
    'Microsoft YaHei UI', 'Microsoft YaHei', 'SimSun', 'NSimSun',
    'SimHei', 'KaiTi', 'FangSong', 'DengXian',
    'KaiTi_GB2312', 'FangSong_GB2312',
    // Families probed by public canvas detectors.
    'Microsoft JhengHei', 'PMingLiU', 'MingLiU', 'DFKai-SB',
    'Source Han Sans CN', 'Source Han Sans SC', 'Source Han Sans TW',
    'Noto Sans CJK SC', 'Noto Serif CJK SC', 'Noto Sans CJK TC',
    'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei',

    // Chinese device / software vendor fonts
    'MiSans VF', 'MiSans', 'MIUI', 'MI Lan Pro',
    'HarmonyOS Sans SC', 'HarmonyOS Sans TC', 'HarmonyOS Sans', 'HONOR Sans',
    'Huawei Sans', 'OPPO Sans', 'vivo Sans',
    'Alibaba PuHuiTi', 'Alibaba Sans', 'DingTalk JinBuTi', 'Douyin Sans', 'HYQiHei',
    'FZLanTingHeiS-R-GB', 'FZLanTingHeiS', 'FZLTHJW',
    'FZYaoti', 'FZShuTi', 'FounderType', 'WPS Office',
    'FZShuSong-Z01S', 'FZKai-Z03S', 'FZHei-B01S', 'FZFangSong-Z02S',
    '方正兰亭黑', '方正黑体', '方正书宋', '方正仿宋',
    '方正楷体', '方正小标宋',
  ].sort((a, b) => b.length - a.length);

  // EXACT blocked-name matching: the full family name, lowercased, must be a
  // member. Substring hits (e.g. "Not Microsoft YaHei Custom") are ordinary
  // families and are never removed.
  const blockedExact = new Set(BLOCKED_FONT_FAMILIES.map((f) => f.toLowerCase()));
  const vendorExact = /^(?:FZ[A-Za-z0-9_-]+|Founder[A-Za-z0-9 _-]+|WPS[A-Za-z0-9 _-]+)$/i;

  // CSS font-shorthand grammar (subset used by <'font'> values).
  const SIZE_KEYWORDS = new Set([
    'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large',
    'xx-large', 'xxx-large', 'smaller', 'larger',
  ]);
  const STYLE_KEYWORDS = new Set(['normal', 'italic', 'oblique']);
  const VARIANT_KEYWORDS = new Set([
    'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps',
    'unicase', 'titling-caps',
  ]);
  const WEIGHT_KEYWORDS = new Set(['bold', 'bolder', 'lighter']);
  const STRETCH_KEYWORDS = new Set([
    'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed',
    'expanded', 'semi-expanded', 'extra-expanded', 'ultra-expanded',
  ]);
  const LENGTH_UNITS = new Set([
    'px', 'em', 'rem', 'pt', 'pc', 'in', 'cm', 'mm', 'q', 'ex', 'ch',
    'cap', 'ic', 'lh', 'rlh', 'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax',
    'svw', 'svh', 'svi', 'svb', 'svmin', 'svmax',
    'lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax',
    'dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax',
    'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax',
  ]);
  const ANGLE_UNITS = new Set(['deg', 'grad', 'rad', 'turn']);

  const NUMBER_RE = /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;
  const NUMBER_UNIT_RE = /^(-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?)([a-z]+|%)$/i;

  // ------------------------------------------------------------------ lex --
  // Tokenize a CSS font value. Tokens: ws, comma, slash, str (quoted
  // string, with escape handling), fn (ident(...) with balanced, quote-aware
  // parens), word (anything else up to a delimiter). Start/end are string
  // indices so the original text can always be reconstructed verbatim.
  function tokenizeFontValue(value) {
    const s = String(value);
    const tokens = [];
    let i = 0;
    const n = s.length;
    const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
    while (i < n) {
      const c = s[i];
      if (isWs(c)) {
        let j = i;
        while (j < n && isWs(s[j])) j++;
        tokens.push({ type: 'ws', text: s.slice(i, j), start: i, end: j });
        i = j;
        continue;
      }
      if (c === '/' && s[i + 1] === '*') {
        const close = s.indexOf('*/', i + 2);
        const j = close === -1 ? n : close + 2;
        tokens.push({ type: 'ws', text: s.slice(i, j), start: i, end: j });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        let content = '';
        while (j < n) {
          if (s[j] === '\\' && j + 1 < n) { content += s[j] + s[j + 1]; j += 2; continue; }
          if (s[j] === c) break;
          content += s[j];
          j++;
        }
        const end = j < n ? j + 1 : j;
        tokens.push({ type: 'str', text: s.slice(i, end), content, start: i, end });
        i = end;
        continue;
      }
      if (c === ',') { tokens.push({ type: 'comma', text: ',', start: i, end: i + 1 }); i++; continue; }
      if (c === '/') { tokens.push({ type: 'slash', text: '/', start: i, end: i + 1 }); i++; continue; }
      if (c === '(' || c === ')') { tokens.push({ type: 'punct', text: c, start: i, end: i + 1 }); i++; continue; }
      let j = i;
      while (j < n && !isWs(s[j]) && s[j] !== ',' && s[j] !== '/' && s[j] !== '"' && s[j] !== "'" && s[j] !== '(' && s[j] !== ')') j++;
      const word = s.slice(i, j);
      if (j < n && s[j] === '(' && /^-?[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF-]*$/.test(word)) {
        // Function token: consume the balanced, quote-aware paren group.
        let depth = 1;
        let k = j + 1;
        let inQ = null;
        while (k < n && depth > 0) {
          const ch = s[k];
          if (inQ) {
            if (ch === '\\' && k + 1 < n) { k += 2; continue; }
            if (ch === inQ) inQ = null;
            k++;
            continue;
          }
          if (ch === '"' || ch === "'") { inQ = ch; k++; continue; }
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          k++;
        }
        const end = depth === 0 ? k : n;
        tokens.push({ type: 'fn', text: s.slice(i, end), name: word.toLowerCase(), start: i, end });
        i = end;
        continue;
      }
      tokens.push({ type: 'word', text: word, start: i, end: j });
      i = j;
    }
    return tokens;
  }

  // True when the token tail after a candidate size position is shaped like a
  // family list (ident words, strings, functions, commas; optional leading
  // /<line-height>), i.e. contains no leftover size/weight/stretch token.
  function tailIsFamilyLike(tokens, from) {
    let i = from;
    while (i < tokens.length && tokens[i].type === 'ws') i++;
    if (i < tokens.length && tokens[i].type === 'slash') {
      i++;
      while (i < tokens.length && tokens[i].type === 'ws') i++;
      i++; // one line-height token
    }
    for (; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'ws') continue;
      if (t.type === 'word') {
        const lower = t.text.toLowerCase();
        if (SIZE_KEYWORDS.has(lower)) return false;
        if (NUMBER_RE.test(t.text)) return false;
        if (/%$/.test(t.text)) return false;
        continue;
      }
      if (t.type === 'str' || t.type === 'fn' || t.type === 'comma' || t.type === 'slash') continue;
      return false;
    }
    return true;
  }

  // Locate the font-size token of a shorthand value. Returns its token index
  // or null when the value has no size (a bare family list). Scan rules:
  //  - style/variant/weight keywords, unitless numbers (weight), angle values
  //    (oblique <angle>) and percentages (stretch, unless nothing else is a
  //    size) are skipped.
  //  - a size keyword, a length/percentage with a known unit, or the unitless
  //    zero is a DEFINITE size.
  //  - a function (var/env/calc/clamp/...) before any definite size is a
  //    CANDIDATE size; the LAST candidate wins if its tail is family-like.
  //  - with no definite size and no usable candidate, the last percentage
  //    doubles as the size (font: 200% Arial).
  function findSizeToken(tokens) {
    let stretchIdx = null;
    let fnIdx = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'ws') continue;
      if (t.type === 'fn') { fnIdx = i; continue; }
      if (t.type !== 'word') continue;
      const w = t.text;
      const lower = w.toLowerCase();
      if (SIZE_KEYWORDS.has(lower)) return i;
      if (w === '0' || w === '-0' || w === '+0') return i;
      const unitMatch = w.match(NUMBER_UNIT_RE);
      if (unitMatch) {
        const unit = unitMatch[2].toLowerCase();
        if (unit === '%') { stretchIdx = i; continue; }
        if (ANGLE_UNITS.has(unit)) continue;
        if (LENGTH_UNITS.has(unit)) return i;
        continue; // unknown unit: not a size, keep scanning
      }
      if (NUMBER_RE.test(w)) continue; // unitless number = weight
      if (STYLE_KEYWORDS.has(lower) || VARIANT_KEYWORDS.has(lower) ||
          WEIGHT_KEYWORDS.has(lower) || STRETCH_KEYWORDS.has(lower)) continue;
      // plain word (family-ish): keep scanning; the size must come earlier.
    }
    if (fnIdx !== null && tailIsFamilyLike(tokens, fnIdx + 1)) return fnIdx;
    if (stretchIdx !== null) return stretchIdx;
    return null;
  }

  // ------------------------------------------------------------- families --
  // Decode CSS escapes in a family name (css-syntax-3 consume-escaped-code-
  // point): simple escapes map the escaped char itself; 1-6 hex digits are
  // consumed plus ONE optional whitespace terminator (CRLF counts as one);
  // escaped newlines produce nothing; invalid code points (0, > U+10FFFF,
  // surrogates) become U+FFFD; a trailing backslash at EOF becomes U+FFFD.
  // This is used ONLY to compare a name against the blocked set; the raw
  // part is never rewritten.
  function decodeCssEscapes(name, quoted) {
    let out = '';
    let i = 0;
    const n = name.length;
    while (i < n) {
      const c = name[i];
      if (!quoted && c === '/' && name[i + 1] === '*') {
        const close = name.indexOf('*/', i + 2);
        i = close === -1 ? n : close + 2;
        if (i < n && name[i] !== ' ' && name[i] !== '\t' && name[i] !== '\n' && name[i] !== '\r' && name[i] !== '\f') out += ' ';
        continue;
      }
      if (c !== '\\') { out += c; i++; continue; }
      if (i + 1 >= n) { out += '\uFFFD'; i++; continue; }
      i++;
      const c2 = name[i];
      if (/[0-9a-fA-F]/.test(c2)) {
        let hex = '';
        while (i < n && hex.length < 6 && /[0-9a-fA-F]/.test(name[i])) { hex += name[i]; i++; }
        let cp = parseInt(hex, 16);
        if (cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
        if (i < n) {
          if (name[i] === '\r') { i += (name[i + 1] === '\n') ? 2 : 1; }
          else if (name[i] === ' ' || name[i] === '\t' || name[i] === '\n' || name[i] === '\f') { i++; }
        }
        out += String.fromCodePoint(cp);
        continue;
      }
      if (c2 === '\n') { i++; continue; }
      if (c2 === '\r') { i += (name[i + 1] === '\n') ? 2 : 1; continue; }
      out += c2;
      i++;
    }
    return out;
  }

  function isBlockedFamilyName(name, quoted) {
    if (!name) return false;
    const decoded = decodeCssEscapes(name, quoted);
    return blockedExact.has(decoded.toLowerCase()) || vendorExact.test(decoded);
  }

  // Split a family-list value into family names. A part consisting of a
  // single quoted string is unquoted for matching; multi-token parts keep
  // their raw text (an unquoted multi-word family like "Microsoft YaHei" or
  // a substring-lookalike like "Not Microsoft YaHei Custom" stays whole).
  function familyNamesOfList(list) {
    const tokens = tokenizeFontValue(list);
    const names = [];
    let cur = [];
    const flush = () => {
      const nonWs = cur.filter((t) => t.type !== 'ws');
      if (nonWs.length) {
        const part = list.slice(nonWs[0].start, nonWs[nonWs.length - 1].end);
        const single = nonWs.length === 1 && nonWs[0].type === 'str';
        names.push(single ? { name: nonWs[0].content, quoted: true } : { name: part, quoted: false });
      }
      cur = [];
    };
    for (const t of tokens) {
      if (t.type === 'comma') { flush(); continue; }
      cur.push(t);
    }
    flush();
    return names;
  }

  function familyNamesOfShorthand(value) {
    const tokens = tokenizeFontValue(value);
    const sizeIdx = findSizeToken(tokens);
    if (sizeIdx === null) return familyNamesOfList(value);
    let i = sizeIdx + 1;
    while (i < tokens.length && tokens[i].type === 'ws') i++;
    if (i < tokens.length && tokens[i].type === 'slash') {
      i++;
      while (i < tokens.length && tokens[i].type === 'ws') i++;
      i++; // one line-height token
    }
    while (i < tokens.length && tokens[i].type === 'ws') i++;
    if (i >= tokens.length) return [];
    return familyNamesOfList(value.slice(tokens[i].start));
  }

  function containsBlockedFont(fontSpec) {
    if (typeof fontSpec !== 'string') return false;
    if (/font(?:-family)?\s*:/i.test(fontSpec)) {
      let hit = false;
      fontSpec.replace(/(^|;)\s*(font|font-family)\s*:\s*([^;]*)/gi, (whole, _pre, prop, value) => {
        const names = prop.toLowerCase() === 'font-family'
          ? familyNamesOfList(value)
          : familyNamesOfShorthand(value);
        if (names.some((n) => isBlockedFamilyName(n.name, n.quoted))) hit = true;
        return whole;
      });
      return hit;
    }
    return familyNamesOfShorthand(fontSpec).some((n) => isBlockedFamilyName(n.name, n.quoted));
  }

  // Convert a family-list value: drop every blocked family, keep the input's
  // ordinary fallbacks verbatim, use a standard CSS generic when nothing
  // remains. Parts are reconstructed from the original string, so preserved
  // families keep their exact quoting and spelling.
  function convertFamilyList(list) {
    const tokens = tokenizeFontValue(list);
    const kept = [];
    let cur = [];
    const flush = () => {
      const nonWs = cur.filter((t) => t.type !== 'ws');
      if (nonWs.length) {
        const part = list.slice(nonWs[0].start, nonWs[nonWs.length - 1].end);
        const single = nonWs.length === 1 && nonWs[0].type === 'str';
        const name = single ? nonWs[0].content : part;
        if (!isBlockedFamilyName(name, single)) kept.push(part);
      }
      cur = [];
    };
    for (const t of tokens) {
      if (t.type === 'comma') { flush(); continue; }
      cur.push(t);
    }
    flush();
    return kept.length ? kept.join(', ') : 'sans-serif';
  }

  // Convert a font shorthand: keep the prefix (style/variant/weight/stretch/
  // size/line-height) verbatim, convert only the trailing family list.
  function convertShorthand(value) {
    const tokens = tokenizeFontValue(value);
    const sizeIdx = findSizeToken(tokens);
    if (sizeIdx === null) return convertFamilyList(value);
    let i = sizeIdx + 1;
    while (i < tokens.length && tokens[i].type === 'ws') i++;
    if (i < tokens.length && tokens[i].type === 'slash') {
      i++;
      while (i < tokens.length && tokens[i].type === 'ws') i++;
      i++; // one line-height token
    }
    while (i < tokens.length && tokens[i].type === 'ws') i++;
    if (i >= tokens.length) return value; // no family part to convert
    return value.slice(0, tokens[i].start) + convertFamilyList(value.slice(tokens[i].start));
  }

  // Unified conversion for every supported entry (Canvas, OffscreenCanvas,
  // CSSStyleDeclaration setters / setProperty / cssText). The value is
  // returned unchanged when it contains no blocked family (exact match). No
  // family is ever invented: every family in the output comes from the
  // input, or is a standard CSS generic family when the input has no usable
  // fallback.
  function rewriteFontSpec(fontSpec) {
    if (typeof fontSpec !== 'string' || !containsBlockedFont(fontSpec)) return fontSpec;
    if (/font(?:-family)?\s*:/i.test(fontSpec)) {
      // Declaration block (cssText): rewrite only font / font-family
      // declarations, preserve everything else.
      return fontSpec.replace(/(^|;)\s*(font|font-family)\s*:\s*([^;]*)/gi, (whole, pre, prop, value) => {
        const converted = prop.toLowerCase() === 'font-family'
          ? convertFamilyList(value)
          : convertShorthand(value);
        return (pre ? pre + ' ' : '') + prop + ': ' + converted;
      });
    }
    if (findSizeToken(tokenizeFontValue(fontSpec)) !== null) return convertShorthand(fontSpec);
    return convertFamilyList(fontSpec);
  }

  function isChineseProfile(locale, timeZone) {
    if (typeof locale === 'string' && /^zh(?:-|$)/i.test(locale)) return true;
    return /^(?:Asia\/(?:Shanghai|Urumqi|Hong_Kong|Macau|Taipei)|PRC|ROC)$/i.test(timeZone || '');
  }

  return {
    BLOCKED_FONT_FAMILIES,
    containsBlockedFont,
    rewriteFontSpec,
    isChineseProfile,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GeoMirrorFontMask;
