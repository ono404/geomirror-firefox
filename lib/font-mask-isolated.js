/* GeoMirror — Firefox ISOLATED-world font mask helpers.
 *
 * Firefox-only variant of lib/font-mask.js for the isolated-world injector.
 * Differences from the shared module:
 *  - No fixed sentinel family: the caller supplies a per-document random
 *    family, so nothing constant and nothing containing project markers is
 *    ever written into the page.
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

  // maskedFamily must be a per-document random family (caller-owned).
  function rewriteFontSpec(fontSpec, maskedFamily) {
    if (typeof fontSpec !== 'string' || !containsBlockedFont(fontSpec)) return fontSpec;
    let rewritten = fontSpec;
    for (const family of BLOCKED_FONT_FAMILIES) {
      rewritten = rewritten.replace(new RegExp(escapeRegExp(family), 'gi'), maskedFamily);
    }
    rewritten = rewritten.replace(
      /(?:FZ[A-Za-z0-9_-]+|Founder[A-Za-z0-9 _-]+|WPS[A-Za-z0-9 _-]+)/gi,
      maskedFamily
    );
    return rewritten;
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
