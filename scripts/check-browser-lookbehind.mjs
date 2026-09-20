#!/usr/bin/env node
// Regex lookbehind guard for everything that ships to a browser.
//
// `(?<=…)` and `(?<!…)` need Safari 16.4. `apps/web/vite.config.ts` builds for
// `target: ['es2022', 'safari15']` (and `safari15` for the native WebView
// wrappers), so a lookbehind that reaches the bundle is a runtime crash on part
// of the audience — WebKit rejects the pattern with
// `SyntaxError: Invalid regular expression: invalid group specifier name`,
// which unmounts whatever React subtree was rendering (GlitchTip issue 561:
// the email autolink pattern in mdast-util-gfm-autolink-literal took down every
// markdown surface in the chat).
//
// Nothing else catches this:
//   * tsc and ESLint do not evaluate regex syntax against a browser target.
//   * esbuild rewrites an unsupported regex LITERAL into `new RegExp(…)`, which
//     turns a parse error into a runtime one — the build stays green either way,
//     and a pattern assembled from strings is invisible to it altogether.
//   * vitest runs on V8, where every one of these patterns works.
// So the check is textual, and it deliberately also matches patterns built as
// strings. Comment lines are skipped — the prose explaining why a rewrite
// avoids a lookbehind has to be able to name the thing.
//
// Node-side code (apps/api, apps/mobile's Hermes bundle, build scripts) is not
// scanned: there the assertion is supported and widely used.
//
// No dependencies — runs on bare node in the Guards job, before install.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['apps/web/src', 'apps/gruen-o-mat/src', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.next',
  'coverage',
  '__snapshots__',
]);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const LOOKBEHIND_RE = /\(\?<[=!]/g;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry))) out.push(full);
  }
  return out;
}

const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir), []));
const errors = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const lines = content.split('\n');
  for (const match of content.matchAll(LOOKBEHIND_RE)) {
    const line = content.slice(0, match.index).split('\n').length;
    const text = lines[line - 1].trimStart();
    if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) continue;
    errors.push(
      `${rel}:${line}: \`${match[0]}\` — lookbehind needs Safari 16.4, this code is built ` +
        `for safari15. Rewrite it (a lookahead, or match the preceding character and put it back).`
    );
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Lookbehind guard: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ No regex lookbehind in browser code (${files.length} files scanned)`);
