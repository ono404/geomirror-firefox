# BLOCKED.md — current maintenance state

## Product blockers

- None.

## Release state

- Firefox `1.2.4` is the formal signed release. The canonical XPI is `web-ext-artifacts/df5a29cf0eba47f89263-1.2.4.xpi`, SHA-256 `d3c822d0607c0379bb6e56ef4456ce4091aa6f67215aee8b68beb9636e057208`.
- The package was Mozilla-signed through the unlisted channel and independently verified in the permanent Firefox profile on 2026-08-14: version `1.2.4`, active/enabled/compatible, `signedState=2`, and installed-XPI hash equal to the canonical artifact. Source, merge, signature, and installation remain separate states for future releases.

## Governance limitation

- GitHub branch protection and repository rulesets are unavailable for this private repository on the current plan. On 2026-08-13, both APIs returned HTTP 403: `Upgrade to GitHub Pro or make this repository public to enable this feature.` (re-verified with authenticated `gh` on 2026-08-13).
- Until the plan changes, `main` protection is a documented operating rule rather than a GitHub-enforced boundary: use short-lived branches, pull requests, and the Firefox CI before merging; reserve direct `main` pushes for explicitly authorized emergencies.
- Landed mitigation (2026-08-13, GOVERNANCE MITIGATION): versioned repo-local pre-push guard `.githooks/pre-push` + `tools/install-guard.mjs` (`core.hooksPath` repo-local, never global). Reverse-validated on a throwaway local bare remote (T1/T3a reject, T2 allow, T3b fail-closed, emergency env + `--no-verify` + no-guard clone bypasses recorded). This is an accidental-push guard, NOT branch protection: every writer with push access can bypass it locally.

## Round-specific finding — retained-9001 failure scenario NOT constructible (2026-08-13, 17:02)

- Task book round "旧9001保留+新写入拒绝" assumes: with rule 9001=Paris retained in a
  full dynamic-rule table, the product's Tokyo write gets a REAL updateDynamicRules
  rejection. Four probe rounds on real Firefox 153 (isolated harness, ports
  18965/18966/18967, evidence `T1-dnr-accept-language/retained-rule-failure/`) prove
  the premise does NOT hold on this Firefox:
  1. `fill-keep` (add 4999 filler block rules, ids 1..4999, table 5000 WITH 9001=Paris)
     succeeds — fill-keep evidence: count 5000, has9001 true, value9001 fr-FR….
  2. Product-shaped atomic call `updateDynamicRules({removeRuleIds:[9001],
     addRules:[9001=Tokyo]})` on the FULL 5000 table is **accepted** (probe-atomic
     outcome "accepted"; after: count 5000, 9001=Tokyo). Firefox 153 quota check is
     NET semantics: current table + addRules − actually-removed rules ≤ 5000
     (the old failure harness's rejection had removeRuleIds=[9001] NOT present in the
     table → 0 removed → 5000+1 > 5000 → reject; with 9001 present the remove hits →
     net 5000 → accept).
  3. The product always issues remove+add together with removeRuleIds=[9001]; when
     9001 is in the table the remove always hits → the product's call can never be
     quota-rejected while 9001 stays. No other REAL rejection mechanism exists on
     this Firefox (rule shape fixed and valid; add-only calls are never issued by the
     product; duplicate-id adds replace per spec).
- Consequence (boundary change, per task book "建议可凭实验证据替代"): the frozen
  retained judge covers the CONSTRUCTIBLE part — initial Paris proven (page+server),
  real fill-keep to 5000 with 9001=Paris retained, REAL harness-issued rejection
  (probe-reject, add-only over quota — rejected, 9001 unchanged before/after), then
  the product's Tokyo write converges (9001=Tokyo, page==header==rule, popup Active).
  The product FAILURE path remains covered by the existing frozen judge-failure
  (no-9001 full table). The fix semantics (on failure, commit the page state to the
  ACTUAL rule table via getDynamicRules(); fall back to native only when 9001 is truly
  absent) are implemented per the task book and pinned by static tests + the
  constructible runtime contract above.

- The previously pending permanent-profile installation is closed by the verified Firefox `1.2.4` installation above. Firefox `1.2.3` remains only as a historical signed artifact.

## Round-specific finding — retained languages blind spot CLOSED (2026-08-13, 18:45)

- The old retained PASS (judge-retain `6b286b56a7c27979`) validated primary language / Intl / server
  header but NOT the full `navigator.languages` array the retained branch commits; the pre-fix branch
  compressed the whole old header into a single item (`override.languages = first ? [first] : null`).
- The gap is now pinned by the supplementary frozen judge `judge-languages.py`
  (`T1-dnr-accept-language/retained-languages-final/`, SHA `efad46707e78987c53b206fc7ccb18285077c2fadf9950abf493534ed37ceac4`
  + loader `load-bg-languages.js` SHA `23a7917745f4e1436ec13b18d24db4c898d6140a7ff3337ba8d1a846ebdacd24`),
  which executes the REAL `handleRuleFailure()` from the actual source file:
  pre-fix current RED (28 fails, single-item `['fr-FR']` + abnormal headers falsely claimed retained),
  candidate GREEN (11 source cases + runtime retained sessions), three tamper kinds RED (9 fails each).
  The constructibility boundary above is unchanged: the product failure path still cannot be
  constructed through the real quota path on Firefox 153, so the retained-branch runtime evidence
  stays on the constructible contract + real-function judge + static behavior tests.

These are release-state boundaries, not product defects. A source-branch push does not imply merge, signing, or publication.
