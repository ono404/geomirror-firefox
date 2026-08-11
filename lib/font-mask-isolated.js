/* GeoMirror — Firefox ISOLATED-world font mask helpers.
 *
 * Firefox-only variant of lib/font-mask.js for the isolated-world injector.
 * Differences from the shared module:
 *  - No sentinel/random family of any kind: the conversion removes blocked
 *    regional families from the assigned value, keeps the ordinary fallbacks
 *    already present in the input, and uses a standard CSS generic family
 *    only when nothing remains. No family is ever invented.
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

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const exactPattern = new RegExp(
    BLOCKED_FONT_FAMILIES.map(escapeRegExp).join('|'),
    'i'
  );
  const vendorPattern = /(?:^|[\s'",])(?:FZ[A-Za-z0-9_-]+|Founder[A-Za-z0-9 _-]+|WPS[A-Za-z0-9 _-]+)(?=$|[\s'",])/i;

  function containsBlockedFont(fontSpec) {
    if (typeof fontSpec !== 'string') return false;
    return exactPattern.test(fontSpec) || vendorPattern.test(fontSpec);
  }

  // Split a CSS family list on top-level commas (quote-aware). Tokens keep
  // their surrounding quotes so preserved fallbacks stay valid CSS.
  function splitFamilyList(list) {
    const out = [];
    let cur = '';
    let inQ = null;
    for (const ch of String(list)) {
      if (inQ) {
        cur += ch;
        if (ch === inQ) inQ = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inQ = ch; cur += ch; continue; }
      if (ch === ',') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function unquote(fam) {
    const t = String(fam).trim();
    if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
      return t.slice(1, -1);
    }
    return t;
  }

  function isBlockedFamily(fam) {
    const name = unquote(fam);
    if (!name) return false;
    return exactPattern.test(name) || vendorPattern.test(name);
  }

  const SIZE_TOKEN = /(?:^|\s)\d+(?:\.\d+)?(?:px|em|rem|pt|pc|in|cm|mm|q|ex|ch|%|vw|vh)(?:\s*\/\s*[^ ,]+)?(?=\s|$)/i;

  // Convert a family-list value: drop every blocked family, keep the input's
  // ordinary fallbacks, use a standard CSS generic when nothing remains.
  function convertFamilyList(list) {
    const kept = [];
    for (const part of splitFamilyList(list)) {
      const fam = part.trim();
      if (!fam) continue;
      if (isBlockedFamily(fam)) continue;
      kept.push(fam);
    }
    return kept.length ? kept.join(', ') : 'sans-serif';
  }

  // Convert a font shorthand: keep the prefix (style/variant/weight/stretch/
  // size/line-height), convert the trailing family list.
  function convertShorthand(value) {
    const s = String(value);
    const size = s.match(SIZE_TOKEN);
    if (!size) return convertFamilyList(s);
    const end = size.index + size[0].length;
    return s.slice(0, end) + ' ' + convertFamilyList(s.slice(end));
  }

  // Unified conversion for every supported entry (Canvas, OffscreenCanvas,
  // CSSStyleDeclaration setters / setProperty / cssText). The value is
  // returned unchanged when it contains no blocked family. No family is ever
  // invented: every family in the output comes from the input, or is a
  // standard CSS generic family when the input has no usable fallback.
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
    if (SIZE_TOKEN.test(fontSpec)) return convertShorthand(fontSpec);
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
