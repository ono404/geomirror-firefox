# Firefox maintenance and release handoff

## Current source state — 2026-08-16 (1.2.5 PR candidate, NOT signed)

- Authoritative Firefox source branch: `main` in `ono404/geomirror-firefox`.
- **Source version `1.2.5` (commit `7c97f22`, PR #6, Firefox CI passed; not yet merged,
  signed, published, or installed)** carries
  three accepted fix sets: the page-realm callable trust boundary (T1), the cross-realm
  consistency fixes (T2), and the captured-`Promise.resolve`-member fix (T2A, closes the
  call-time member-lookup crossing left by the T1 constructor capture), each proven
  RED→GREEN→RED on frozen real-Firefox judges (evidence `../evidence/firefox-security-1.2.5/`).
  The last signed/installed version remains `1.2.4`.
- **Final acceptance state (2026-08-16, `final-governance-closeout/`)**: PRODUCT ACCEPT;
  EVIDENCE CRYPTOGRAPHIC AUTHENTICITY REJECT (the v3 judges verify in-directory internal
  consistency only — the attack review showed complete self-consistent forgeries pass them;
  the independent manager anchor detects post-anchor changes but cannot prove pre-anchor
  history); OPERATIONAL RELEASE READINESS ACCEPT under the stated operational trust model
  (`SECURITY_MODEL.md`). The earlier v2 "EVIDENCE ACCEPT" was revoked by the v3 report.
  Remaining steps: authorized merge → Mozilla signing → permanent-install verification.
  Each release step is a separate authorization.
- Source version `1.2.4` contains the accepted DNR failure/coherence fix and local main-push mitigation. PR #4 merged the maintenance candidate to `main` at `24bde6078fd9aecf550dfae0b82a8a85b5ae28c6`; its pull-request and merged-main Firefox CI runs passed.
- PR #1 merged the accepted isolated-runtime history at `0657406c1c9f1a8e85111e4a4c1d0cecd678207a` without squashing.
- The implementation acceptance commit `95486617d7c9fd3fc4beb9dd41c517b815bece62` is contained in `main`; `agent/firefox-isolated-runtime` is a completed historical branch.
- Private repository: `https://github.com/ono404/geomirror-firefox.git`.
- `.github/workflows/firefox-ci.yml` runs on pull requests and pushes to `main`; the PR head and merged `main` both passed the Firefox source checks.
- Firefox 153.0.4 independent acceptance: `ACCEPT` with 79 tests, build/lint, extension-off/on controls, Paris/Tokyo regional matrices, and server-observed `Accept-Language` coverage.
- Firefox architecture: one ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`), with no page-visible DOM bridge. `1.2.5` adds `match_about_blank` + `match_origin_as_fallback` to the Firefox content script and a content-script → background runtime profile channel (subframe `chrome.storage` is dead on Firefox 153 — measured; see BLOCKED.md).
- Accepted limitations: generic JavaScript wrapper source/stack differences, Geolocation `structuredClone` WebIDL internal-slot behavior, and the T2 platform limitations (workers and top-level `data:` documents cannot carry content scripts — classified C, recorded in the frozen matrix judge).
- In this maintenance workspace, historical raw evidence lives outside the Git repository under `../evidence/`; it is not part of a GitHub clone.

## Signed-package state

- Both source manifests declare candidate version `1.2.5` (PR #6; the signed manifest is `1.2.4`).
- Current signed package: `web-ext-artifacts/df5a29cf0eba47f89263-1.2.4.xpi`.
- Signed package SHA-256: `d3c822d0607c0379bb6e56ef4456ce4091aa6f67215aee8b68beb9636e057208`.
- Mozilla accepted and signed this unlisted XPI on 2026-08-14. Its manifest is `1.2.4`, Mozilla signature files are present, and its non-signature payload matches the accepted Firefox build (manifest JSON is semantically equal and packaged README text is equal after newline normalization; all other payload files are byte-identical).
- Permanent-profile verification on 2026-08-14 found version `1.2.4` active, enabled, application-compatible, and Mozilla-signed (`signedState=2`); the installed XPI hash exactly matched the canonical artifact above.
- Historical `1.1.0`, `1.2.1`, `1.2.2`, and `1.2.3` XPI files remain audit artifacts. GitHub source changes do not update an installed add-on automatically.

## Maintenance workflow

1. Inspect the real checkout and reproduce the issue with extension-off/on controls.
2. Preserve the boundaries in `AGENTS.md`; do not expand GeoMirror into a full anti-detect browser.
3. Run the complete check set:

```powershell
node test/run-tests.js
node test/inject-smoke.js
node --check background.js
node --check content-isolated.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
node --check lib/locale.js
node --check lib/timezone.js
node --check lib/font-mask.js
node --check lib/font-mask-isolated.js
node --check tools/build-firefox.mjs
node --check tools/serve-firefox-verify.mjs
node tools/build-firefox.mjs
web-ext.cmd lint --source-dir dist/firefox
git diff --check
```

4. For browser-visible changes, verify Firefox with fresh profiles, ordinary-page probes, server-observed headers, exact source SHA, and owned-process cleanup. Static analysis alone cannot prove runtime behavior.
5. Push a short-lived feature/release branch to `my-private`, open a pull request to `main`, and merge only after Firefox CI passes and the merge is authorized. Signing and publication remain separate authorizations.

### Main push guard (GOVERNANCE MITIGATION, 2026-08-13)

GitHub branch protection and rulesets are unavailable for this private repository on the current plan (both APIs returned HTTP 403 on 2026-08-13; re-verified with authenticated `gh` on 2026-08-13). The pull-request and CI gate is therefore an operating rule until the repository becomes public or the account is upgraded. A versioned repo-local guard lowers accidental-push risk:

- `.githooks/pre-push` rejects direct `refs/heads/main` pushes (including deletion); feature branches and tags pass. Escape hatch: `GEOMIRROR_EMERGENCY_MAIN_PUSH=1`.
- Install per clone: `node tools/install-guard.mjs` (repo-local `core.hooksPath`, never global).
- Honest bypass list (every writer with push access can bypass locally; this is not branch protection):
  1. `git push --no-verify`
  2. a fresh clone without the install step (hook config is per-clone)
  3. deleting `.githooks/pre-push` or `git config --local --unset core.hooksPath`
  4. GitHub web edits (no local git involved)
- Reverse-validated on a throwaway local bare remote: direct main push rejected, feature branch allowed, broken hook fails closed, emergency env accepted, `--no-verify` and no-guard clones bypass as documented. Evidence: `../evidence/firefox-next-maintenance/T2-main-push-guard/validation/validation.log`.

## T1 Accept-Language failure semantics — retained-rule round (2026-08-13)

- Previous round fixed the silent-failure class (honest error state, page/header coherence) and the Chromium `beacon→ping` runtime selection.
- This round adds: on a REJECTED `updateDynamicRules`, the override commits to the ACTUAL dynamic rule table, never to the intended target and never to a guess:
  - rule 9001 present -> override language fields derive from the LIVE rule value (old region stays; page language == the header the server really receives), `langEnabled` stays true, state error + `langFailed` + real reason + `[retained]`.
  - rule 9001 absent -> language fields stripped (native page == native header), `[stripped]`.
  - rule table unreadable -> override kept unchanged (atomic rejection leaves the table exactly as the last successful commit, so the override still matches it), explicit `[unreadable]` error; stripping could create the mismatch this handler exists to prevent.
- All four failure paths route through the single `handleRuleFailure(override, context)` helper: refresh, onStartup re-assert, language toggle (a failed toggle also refuses to flip the setting and prevents the settings-derived `langEnabled` from overwriting the actual-table commit), and non-language settings re-assert. `content-isolated.js` needs no change (it already reads the committed override).
- Empirical boundary (evidence `../evidence/firefox-next-maintenance/T1-dnr-accept-language/retained-rule-failure/`, also in `BLOCKED.md`): on Firefox 153 the quota check is NET — `current table + addRules − actually-removed rules ≤ 5000` — so the product's always-remove+add call with rule 9001 present in a full table SUCCEEDS (remove hits). The "new write rejected while old 9001 retained" failure is therefore not constructible through the product path on this Firefox; the constructible contract (initial Paris proven, fill-keep 5000 with 9001 retained, real harness-issued rejection with 9001 unchanged before/after, product write converging to Tokyo, recovery) is pinned by the frozen `judge-retain.py` (SHA `6b286b56a7c27979`), and the product failure path stays covered by the existing frozen `judge-failure.py` (no-9001 full table).

## T1 retained-branch languages completeness (2026-08-13)

- The retained branch commits the FULL ordered `navigator.languages` list of the ACTUAL rule header, never the single-item `['first']` shape: `background.js` gains a small pure parser `alLanguageList(header)` (strip `;q=`, trim, keep source order; only the project's own legal header shape is accepted). `handleRuleFailure()` retained branch now commits `locale = tags[0]`, `languages = tags`, `acceptLanguage = actual`, `langEnabled = true`; a live header that is not a legal project shape (or is missing) is NOT claimed as retained — the previous committed state is kept and the failure is reported with an explicit `[unreadable]` outcome.
- Blind spot closed: the previous retained PASS (`judge-retain.py`) checked primary language / Intl / server header but never the full `navigator.languages` array. The supplementary frozen judge `judge-languages.py` (SHA `efad46707e78987c53b206fc7ccb18285077c2fadf9950abf493534ed37ceac4`, loader `load-bg-languages.js` `23a7917745f4e1436ec13b18d24db4c898d6140a7ff3337ba8d1a846ebdacd24`, evidence `../evidence/firefox-next-maintenance/T1-dnr-accept-language/retained-languages-final/`) executes the REAL `handleRuleFailure()` from the actual source file in a Node vm sandbox and asserts the full-array contract for Paris/Tokyo/whitespace/leading-dot-q/reversed project headers plus six abnormal shapes (unreadable, override unchanged). Reverse validation: pre-fix current RED (28 fails, `['fr-FR']`), candidate GREEN, three runtime tamper kinds (missing item / reordered / `;q=` fragment) RED (9 fails each).
- Regression evidence: candidate Firefox full matrix 3 rounds (judge-normal PASS, judge-failure PASS) + retained 3 rounds (judge-retain PASS, judge-languages PASS incl. runtime mode: page `navigator.languages` == full ordered list of the actual server-received header, first item == `navigator.language`, marker=0); current production SHA full matrix 1 + retained 1 round (language arrays full, marker=0; pre-fix failure signature reproduced honestly); Chrome 3 + Edge 3 rounds (judge-chromium PASS). 89 static tests (85+4 new behavior tests), 0 skipped.

## Permanent Firefox release

1. Increase `version` in both source manifests.
2. Build, lint, test, and repeat affected runtime acceptance.
3. Keep Mozilla credentials outside Git and sign from environment variables:

```powershell
web-ext.cmd sign --source-dir dist/firefox --channel unlisted --api-key $env:WEB_EXT_API_KEY --api-secret $env:WEB_EXT_API_SECRET
```

4. Install and manually verify the returned signed XPI.
5. Keep one canonical package under `web-ext-artifacts/`, commit it intentionally, and push the release branch.
6. Merge to `main` only with explicit authorization.

Temporary testing remains available through `about:debugging#/runtime/this-firefox` by selecting `dist/firefox/manifest.json`.
