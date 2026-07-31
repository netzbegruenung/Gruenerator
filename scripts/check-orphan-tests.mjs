#!/usr/bin/env node
// Orphaned-test guard.
//
// `apps/api/agents/langgraph/SearchGraph/nodes/queryPlannerNode.test.ts` and
// `searchRespondNode.test.ts` imported `describe`/`it`/`expect` from `vitest`
// and their own header comment said `Run with: npx vitest run …` — but
// `apps/api/vitest.config.ts` only ever included `**/*.vitest.ts`. Naming them
// `.test.ts` instead of `.vitest.ts` silently excluded both from every
// `pnpm test` run for months: no config, no CI job, no `pnpm ci` ever executed
// them. The file looked exactly like a test that runs.
//
// This script fails when a file imports `vitest`, declares an actual test
// (`describe`/`it`/`test`), and its name isn't matched by any vitest project's
// `include` glob in this repo — i.e. a test suite nobody runs. The test-
// declaration check keeps setup files (`vitest.setup.ts`, referenced via
// `setupFiles`, not `include`) and plain test helpers (mocks/stubs imported by
// real test files) out of scope — they import vitest utilities but never run
// as a suite themselves.
//
// No dependencies — runs before `pnpm install` in the Quality job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['apps', 'packages', 'services'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', '.next']);

// `include` globs collected from every `vitest.config.ts` in the repo (apps/api,
// apps/mobile, apps/web, packages/canvas-editor, packages/chat, packages/docs,
// packages/shared, services/hocuspocus, services/mcp): all of them match
// `**/*.vitest.ts`, and `apps/web`/`packages/chat` additionally match
// `**/*.vitest.tsx` for their jsdom project.
const CAPTURED_SUFFIXES = ['.vitest.ts', '.vitest.tsx'];

// `packages/presentations/vitest.config.ts` is the one config that deviates —
// it still runs `**/*.test.ts` / `**/*.test.tsx`, pre-dating the `.vitest.ts`
// convention. Scope the exception to that directory: elsewhere, `.test.ts` is
// exactly the orphaned pattern this guard exists to catch.
const PRESENTATIONS_DIR = path.join(ROOT, 'packages', 'presentations') + path.sep;
const PRESENTATIONS_SUFFIXES = ['.test.ts', '.test.tsx'];

// `packages/sheets` has no `vitest.config.ts` at all — its `test` script is a
// bare `vitest run`, so vitest's own default include glob applies
// (`**/*.{test,spec}.?(c|m)[jt]s?(x)`), which matches `.test.ts`/`.test.tsx`.
// Without this exception every `.test.ts` file in that package — all of which
// import `vitest` and all of which run fine today — would falsely trip the
// guard.
const SHEETS_DIR = path.join(ROOT, 'packages', 'sheets') + path.sep;
const SHEETS_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

const VITEST_IMPORT_RE = /from\s+['"]vitest['"]|import\(\s*['"]vitest['"]\s*\)/;
const TEST_DECLARATION_RE = /\b(?:describe|it|test)\s*(?:\.\w+)?\s*\(/;

/**
 * Both regexes must see code only. Prose trips them: a harness doc comment
 * reading "full state reset per test (beforeEach)" contains a literal
 * `test (`, which a regex cannot tell from a test declaration — that alone
 * reported a shared helper as an orphaned suite and turned the guard red on
 * every branch cut from master.
 *
 * Strings are stripped for the declaration check only; the import check needs
 * them, because the module specifier `'vitest'` IS a string.
 *
 * Not a parser, and it need not be: comments and string literals are the only
 * constructs that can fake a declaration, and both are recognisable in one
 * pass. Removed characters become spaces so offsets stay true.
 *
 * Deliberately biased towards silence over noise. It does not know regex
 * literals (`/…\//` ending in two slashes swallows the rest of its line) and
 * treats a lone apostrophe in JSX text as a string start. Both can only ever
 * HIDE a declaration, never invent one — and only when the hidden declaration
 * shares a line with the oddity, in a file that imports vitest and is not
 * already named `.vitest.ts(x)`. A missed orphan costs one unrun suite; a
 * false alarm turns the Quality job red on every branch cut from master, which
 * is exactly what this stripper exists to stop.
 */
function stripNonCode(source, { stripStrings }) {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const pair = source.slice(i, i + 2);

    if (pair === '//') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }

    if (pair === '/*') {
      while (i < source.length && source.slice(i, i + 2) !== '*/') {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }

    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      const start = i;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      const literal = source.slice(start, i);
      out += stripStrings ? literal.replace(/[^\n]/g, ' ') : literal;
      continue;
    }

    out += source[i];
    i++;
  }

  return out;
}

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
    else if (/\.[cm]?[tj]sx?$/.test(name)) out.push(full);
  }
  return out;
}

function isCaptured(file) {
  if (CAPTURED_SUFFIXES.some((suffix) => file.endsWith(suffix))) return true;
  if (file.startsWith(PRESENTATIONS_DIR)) {
    return PRESENTATIONS_SUFFIXES.some((suffix) => file.endsWith(suffix));
  }
  if (file.startsWith(SHEETS_DIR)) {
    return SHEETS_SUFFIXES.some((suffix) => file.endsWith(suffix));
  }
  return false;
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
const violations = [];

for (const file of files) {
  if (isCaptured(file)) continue;
  const content = readFileSync(file, 'utf-8');
  if (!VITEST_IMPORT_RE.test(stripNonCode(content, { stripStrings: false }))) continue;
  if (!TEST_DECLARATION_RE.test(stripNonCode(content, { stripStrings: true }))) continue;
  violations.push(path.relative(ROOT, file));
}

if (violations.length > 0) {
  console.error('\n✖ Test file imports vitest but no vitest `include` glob matches it — it never runs\n');
  for (const file of violations) {
    console.error(`  ${file}`);
    console.error('    Rename it to end in `.vitest.ts` (or `.vitest.tsx`) so vitest picks it up.\n');
  }
  process.exit(1);
}

console.log(`✓ No orphaned test files (${files.length} files scanned)`);
process.exit(0);
