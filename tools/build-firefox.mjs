#!/usr/bin/env node
/**
 * Build a Firefox-loadable development package for GeoMirror.
 *
 * Output: dist/firefox/
 *
 * Behavior:
 *  - Recreate dist/firefox from scratch on every run.
 *  - Copy the Chrome-compatible source files unchanged.
 *  - Copy manifest.firefox.json -> dist/firefox/manifest.json so Firefox sees a
 *    Firefox-shaped manifest without touching the Chrome manifest.
 *  - Exclude .git, tests, docs, node_modules, and source-control metadata.
 *
 * Uses only Node built-in modules (fs, path, url) — no npm dependencies.
 *
 * Usage:
 *   node tools/build-firefox.mjs
 */
import { existsSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'dist', 'firefox');

// Top-level files that must ship in the Firefox package.
const FILES = [
  'background.js',
  'content-bridge.js',
  'content-inject.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'PRIVACY.md',
  'README.md',
];

// Directories copied recursively.
const DIRS = ['lib', 'icons'];

// Files/dirs never copied into the package even if they live under a copied dir.
const EXCLUDE_NAMES = new Set([
  '.git',
  '.github',
  '.gitignore',
  '.DS_Store',
  'node_modules',
  'dist',
  'test',
  'docs',
  'tools',
  'manifest.json',
  'manifest.firefox.json',
  'README.zh-CN.md',
  'LICENSE',
]);

function rmout() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

function copyFile(srcRel, destRel) {
  const src = join(ROOT, srcRel);
  const dest = join(OUT, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function copyDir(srcRel) {
  const src = join(ROOT, srcRel);
  if (!existsSync(src)) return 0;
  // Preserve the subdirectory (e.g. dist/firefox/lib, dist/firefox/icons),
  // because manifest.json references lib/* and icons/* by relative path.
  const destRoot = join(OUT, srcRel);
  mkdirSync(destRoot, { recursive: true });
  let count = 0;
  const stack = [{ from: src, to: destRoot }];
  while (stack.length) {
    const { from, to } = stack.pop();
    for (const entry of readdirSync(from)) {
      if (EXCLUDE_NAMES.has(entry)) continue;
      const fromPath = join(from, entry);
      const toPath = join(to, entry);
      const st = statSync(fromPath);
      if (st.isDirectory()) {
        mkdirSync(toPath, { recursive: true });
        stack.push({ from: fromPath, to: toPath });
      } else if (st.isFile()) {
        copyFileSync(fromPath, toPath);
        count += 1;
      }
    }
  }
  return count;
}

function writeFirefoxManifest() {
  const src = readFileSync(join(ROOT, 'manifest.firefox.json'), 'utf8');
  // Re-serialize as two-space JSON so the shipped manifest is normalized and
  // easy to inspect in about:debugging.
  const parsed = JSON.parse(src);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function main() {
  rmout();

  let fileCount = 0;
  for (const f of FILES) {
    if (!existsSync(join(ROOT, f))) {
      throw new Error(`Required source file missing: ${f}`);
    }
    copyFile(f, f);
    fileCount += 1;
  }

  for (const d of DIRS) {
    fileCount += copyDir(d);
  }

  writeFirefoxManifest();
  fileCount += 1; // manifest.json

  const rel = relative(process.cwd(), OUT);
  console.log(`Firefox package built at ${rel}`);
  console.log(`Files written: ${fileCount}`);
  console.log('Load in Firefox via about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" -> choose manifest.json');
}

main();
