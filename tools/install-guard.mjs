#!/usr/bin/env node
/**
 * GeoMirror main-push guard installer (repo-local, never global).
 *
 * Usage: node tools/install-guard.mjs
 *
 * Sets `core.hooksPath` to `.githooks` for THIS clone only. A fresh clone
 * does NOT inherit the setting — run this once after cloning (documented in
 * docs/FIREFOX_BUGFIX_HANDOFF.md). Reversible with:
 *   git config --local --unset core.hooksPath
 *
 * The guard is an accidental-push guard, not a security boundary: every
 * writer with push access can bypass it (--no-verify, unsetting the config,
 * deleting the hook, a clone without the install step, GitHub web edits).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repo = process.cwd();
const hook = resolve(repo, ".githooks", "pre-push");

if (!existsSync(hook)) {
  console.error(`install-guard: ${hook} not found — run from the repo root.`);
  process.exit(1);
}

let cfg = "";
try {
  cfg = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], {
    encoding: "utf8",
  }).trim();
} catch {
  // `git config --get` exits 1 when the key is unset — treat as empty.
}
if (cfg === ".githooks") {
  console.log("install-guard: core.hooksPath already set to .githooks (idempotent, nothing to do).");
  process.exit(0);
}
if (cfg) {
  console.error(`install-guard: core.hooksPath is currently '${cfg}' — refusing to overwrite.`);
  process.exit(1);
}

execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
console.log("install-guard: installed repo-local core.hooksPath=.githooks (this clone only).");
