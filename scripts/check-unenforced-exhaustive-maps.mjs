#!/usr/bin/env node
// Unenforced-exhaustive-map guard.
//
// `apps/api/tsconfig.json` excludes `**/*.vitest.ts`, and the API eslint config
// runs without type information. A test file may therefore declare
//
//     const HANDLED: Record<SearchIntent, string> = { ... }
//
// and be MISSING entries: nothing type-checks it. The annotation reads like a
// guarantee and is decoration.
//
// That is not hypothetical. `intentPipeline.vitest.ts` is the file whose job is
// to catch intents nobody wired up, and the generator script next to it stated
// "TypeScript forces it to cover every intent" — which was false for exactly
// that file. An intent added to the enum and nowhere else was invisible to it.
//
// Two ways to make such a map real, both accepted here:
//   1. move it into a production module, where `tsc` sees it; or
//   2. iterate the enum at RUNTIME in the test
//      (`for (const x of someSchema.options) expect(MAP[x]).toBeDefined()`),
//      which is enforcement the exclusion cannot switch off.
//
// This script fails when a test file declares an exhaustive mapped type over a
// closed union AND has no runtime loop over that union's `.options`.
//
// No dependencies — runs before `pnpm install` in the Quality job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['apps', 'packages', 'services'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', '.next']);

/**
 * Unions that are closed sets with a Zod enum behind them, i.e. the ones where
 * "did I cover every case?" is a real question. Add a name here when a new
 * closed set starts being mapped exhaustively.
 */
const CLOSED_UNIONS = ['SearchIntent', 'ChatWarningCode', 'ChatErrorCode', 'RubricName'];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.vitest.ts') || name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
const violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (const union of CLOSED_UNIONS) {
    // `Record<Union, X>` / `satisfies readonly Union[]` — an exhaustiveness claim.
    const claim = new RegExp(`Record<\\s*${union}\\s*,|satisfies\\s+readonly\\s+${union}\\[\\]`);
    if (!claim.test(content)) continue;

    // A runtime loop over the enum's options IS enforcement — that is the
    // pattern we want people to reach for, so it clears the check.
    const runtimeEnforced = /\.options\b/.test(content);
    if (runtimeEnforced) continue;

    const idx = lines.findIndex((l) => claim.test(l));
    violations.push({
      file: path.relative(ROOT, file),
      line: idx + 1,
      union,
      snippet: (lines[idx] ?? '').trim(),
    });
  }
}

if (violations.length > 0) {
  console.error('\n✖ Exhaustive map in a test file that nothing enforces\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.snippet}`);
    console.error(
      `    Claims to cover every ${v.union}, but *.vitest.ts is excluded from tsconfig — tsc never checks it.\n`
    );
  }
  console.error('  Fix it one of two ways:');
  console.error('    1. move the map into a production module, where tsc sees it; or');
  console.error(
    "    2. loop the enum at runtime, e.g. `for (const x of someSchema.options) expect(MAP[x]).toBeDefined()`.\n"
  );
  process.exit(1);
}

console.log(`✓ No unenforced exhaustive maps (${files.length} test files scanned)`);
