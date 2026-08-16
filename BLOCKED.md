# BLOCKED.md — current maintenance state

## Product blockers

- None.

## Current acceptance state (2026-08-16, final-governance-closeout)

- Three-axis verdict (full text: `../evidence/firefox-security-1.2.5/final-governance-closeout/FINAL_REPORT.md`, trust model: `SECURITY_MODEL.md`):
  - **PRODUCT: ACCEPT** — the 1.2.5 fixes behave per frozen semantics, confirmed by two independent fresh-Firefox runs (original v3 run + manager-review-v3-ai2 rerun), 90 tests/0 skipped, build 17, lint 0/0/0.
  - **EVIDENCE CRYPTOGRAPHIC AUTHENTICITY: REJECT (NOT PROVIDED)** — the attack review proved complete self-consistent forgeries (c07 forged run records; c09b forged authority + decoy repo) are ACCEPTED by all four v3 judges. The v3 judges verify internal consistency only; they cannot certify historical truth. The ATTACK REVIEW REJECT is retained and must not be reworded as a pass.
  - **OPERATIONAL RELEASE READINESS: ACCEPT** — under the operational trust model (trusted independent executor/manager + manager anchor detects post-anchor changes; the anchor cannot prove pre-anchor history).
- Conclusion: the fix phase may close and the release process may begin (short-lived branch → commit → PR/CI → authorized merge → Mozilla signing → permanent-install verification). 1.2.5 remains LOCAL unpublished source; the last formal release is still 1.2.4.
- The old "v2 EVIDENCE ACCEPT" below is historical: the v2 evidence-chain ACCEPT was REVOKED by the v3 report (2026-08-15, conditional-isdir bypass demonstrated).

## Independent acceptance v2 (2026-08-14) — HISTORICAL, evidence verdict superseded

- GeoMirror Firefox 1.2.5 local source passed independent acceptance:
  PRODUCT ACCEPT + EVIDENCE ACCEPT (report `../evidence/firefox-security-1.2.5/
  independent-acceptance-v2/REPORT.md`). **Superseded (2026-08-15/16): the
  EVIDENCE ACCEPT was revoked — the v2 chain's live-source binding was
  bypassable (conditional isdir), and the later v3 chain proved
  internal-consistency-only under the attack review. The PRODUCT side was
  re-confirmed by the v3 frozen judges and the independent manager rerun;
  see "Current acceptance state" above.** The acceptance found and fixed ONE
  real crossing (T2A: call-time `Promise.resolve` member lookup on the page's
  captured Promise object was page-interceptable; fixed by capturing the
  member at document_start). Pending-query path measured NOT interceptable.
- Acceptance evidence-accuracy correction: older "data-popup = host values"
  rows were vacuous readings of a never-navigated `about:blank` popup; the
  v2 judges require the explicit platform-block record (see Platform
  limitations below).

## Release state

- Firefox `1.2.4` is the last signed release. The canonical XPI is `web-ext-artifacts/df5a29cf0eba47f89263-1.2.4.xpi`, SHA-256 `d3c822d0607c0379bb6e56ef4456ce4091aa6f67215aee8b68beb9636e057208`.
- The package was Mozilla-signed through the unlisted channel and independently verified in the permanent Firefox profile on 2026-08-14: version `1.2.4`, active/enabled/compatible, `signedState=2`, and installed-XPI hash equal to the canonical artifact. Source, merge, signature, and installation remain separate states for future releases.
- **Local source state (2026-08-14): version `1.2.5` in both manifests is the LOCAL source state only — NOT signed, NOT published, NOT installed.** It carries the T1 page-realm callable-trust fixes, the T2 cross-realm fixes, and the T2A captured-`Promise.resolve`-member fix (the member capture closes the call-time member-lookup crossing left by the T1 constructor capture; pending-path constructor is measured not page-interceptable). The signed/installed version remains `1.2.4` until an explicitly authorized release/signing cycle.

## Platform limitations (T2-cross-realm, measured 2026-08-14, Firefox 153.0.4)

- **Workers cannot be spoofed (C)**: Firefox has no content-script support in Dedicated/Shared
  Workers (no `worker` content-script key). A page-created worker always reads the REAL host
  timezone/language (measured: worker/sharedworker realms return zh-CN/Asia/Singapore/-480 on
  every round, extension on or off). Fixing this requires an architecture Firefox does not
  offer; classified C, recorded in the frozen matrix judge as the C-class contract, NOT fixed.
- **Top-level `data:` navigation is BLOCKED on Firefox 153 (C, refinement 2026-08-14)**:
  `window.open('data:text/html,…')` returns a non-null handle but the popup NEVER navigates —
  it stays `about:blank` (opener reads `location.href` as `about:`/empty; the popup's scripts
  never run, no postMessage arrives; measured with the independent-acceptance harness,
  diagnostic in `independent-acceptance-v2/lib/diag-popup.py` + `scratch-diag-popup/`). A
  top-level `data:` document therefore never exists in practice, so it can neither be spoofed
  (previous record) nor even observed. The C-class record for the data-popup realm is the
  explicit platform block (`error: 'top-level-data-nav-blocked'`), enforced by the v2 matrix
  and switch judges. Note: older evidence rows that showed "data-popup = host values" were
  vacuous readings of the never-navigated `about:blank` window, not of a `data:` document.
- **Subframe `chrome.storage` is dead on this Firefox (platform fact behind the B fix)**:
  in subframe content scripts `storage.local.get` fails with "An unexpected error occurred"
  and `storage.onChanged` never fires (measured via harness diagnostics in every realm class).
  The B fix therefore delivers the profile to subframes over the content-script → background
  runtime channel (`runtime.sendMessage` works in every frame class, measured). The page
  (MAIN world) can neither send nor receive these messages — no page-visible channel is added.

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
