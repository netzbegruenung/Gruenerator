#!/usr/bin/env node
// Decision-journal guard.
//
// `apps/api/utils/decisionJournal.ts` defines `DECISION_POINTS`, a closed
// registry of decision-point ids, and `recordDecision(point, chose, …)` call
// sites live scattered across production files. Those ids land in committed
// decision-map snapshots, which makes them F1 — internally frozen (see
// CLAUDE.md): renamed via a comment in the registry, never via a migration.
// Four properties keep that registry honest, and none of them are enforced
// by anything else:
//
//   1. Every `recordDecision` call uses an id the registry actually declares.
//      tsc already catches this — `chose` is typed as `BranchOf<P>` — but
//      this guard runs BEFORE `pnpm install`, so it is the fast,
//      dependency-free first signal, long before tsc gets a chance.
//   2. No `inputs` key is time-shaped. A decision map is read as a diff
//      between runs; a `latencyMs` or `timestamp` field makes every single
//      run differ from the last one, turning a meaningful diff into noise.
//   3. Every registry point has at least one call site. A point nobody ever
//      records is dead registry — a guard nobody asks about.
//   4. `recordDecision` never appears in a `*.vitest.ts` file. The journal is
//      production instrumentation; a test that writes its own entries
//      falsifies the decision map it is supposed to describe. One file is
//      allowlisted below — the test of the recording MECHANISM itself, which
//      cannot prove the store binds without writing an entry through it.
//
// No dependencies — runs before `pnpm install` in the Quality job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['apps', 'packages', 'services'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', '.next']);

const JOURNAL_FILE = path.join(ROOT, 'apps/api/utils/decisionJournal.ts');
const TIME_SHAPED_KEY_RE = /ms$|time|date|latency|duration/i;

/**
 * Test files permitted to call `recordDecision`. An explicit list of paths, not
 * a pattern: the exception exists for tests of the recording mechanism itself
 * (does the AsyncLocalStorage store bind, does the sink write what was
 * recorded), and it must not generalise into "any test near the journal".
 * Adding a scenario file here would defeat rule 4 entirely.
 */
const RECORD_DECISION_TEST_ALLOWLIST = new Set(['apps/api/utils/decisionLog.vitest.ts']);

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

/**
 * Parse the top-level keys of the `as const` `DECISION_POINTS` object out of
 * `decisionJournal.ts`. A regex over the top-level keys is enough — this
 * guard deliberately stays dependency-free rather than pulling in a TS
 * parser for one object literal.
 */
function parseRegistryPoints(source) {
  const objStart = source.indexOf('export const DECISION_POINTS');
  if (objStart === -1) return [];
  const braceStart = source.indexOf('{', objStart);
  if (braceStart === -1) return [];

  // Walk forward tracking brace depth to find the matching closing brace of
  // the top-level object, then only match keys at depth 1 within it.
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  const body = source.slice(braceStart + 1, end);
  const points = [];
  const keyRe = /(?:^|\n)\s*(?:\/\*\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]\s*:\s*{/g;
  let depthWithinBody = 0;
  let match;
  // Only accept keys found while at depth 0 relative to `body` (i.e. the
  // top-level keys of DECISION_POINTS, not nested `branches` entries).
  let lastIndex = 0;
  while ((match = keyRe.exec(body)) !== null) {
    const before = body.slice(lastIndex, match.index);
    for (const ch of before) {
      if (ch === '{') depthWithinBody++;
      else if (ch === '}') depthWithinBody--;
    }
    lastIndex = match.index;
    if (depthWithinBody === 0) points.push(match[1]);
  }
  return points;
}

/**
 * Find every `recordDecision(...)` call in `content`, returning the matched
 * point id (if the first argument is a string literal), the raw argument
 * text (for inputs-key scanning), the line number, and whether the call
 * could be parsed with confidence.
 */
function findRecordDecisionCalls(content) {
  const calls = [];
  const callRe = /recordDecision\s*\(/g;
  let match;
  while ((match = callRe.exec(content)) !== null) {
    const parenStart = callRe.lastIndex - 1;
    const argsEnd = findMatchingParen(content, parenStart);
    const line = content.slice(0, match.index).split('\n').length;
    if (argsEnd === -1) {
      calls.push({ line, parsable: false, args: null, point: null });
      continue;
    }
    const args = content.slice(parenStart + 1, argsEnd);
    const pointMatch = args.match(/^\s*['"]([^'"]+)['"]/);
    calls.push({
      line,
      parsable: true,
      args,
      point: pointMatch ? pointMatch[1] : null,
    });
  }
  return calls;
}

/** Given the index of an opening `(`, return the index of its matching `)`. */
function findMatchingParen(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extract the top-level keys of the `inputs: { ... }` object literal inside
 * a call's argument text, if present.
 */
function findInputsKeys(args) {
  const inputsStart = args.search(/inputs\s*:\s*{/);
  if (inputsStart === -1) return { keys: [], parsable: true };
  const braceStart = args.indexOf('{', inputsStart);
  if (braceStart === -1) return { keys: [], parsable: false };
  const braceEnd = findMatchingBrace(args, braceStart);
  if (braceEnd === -1) return { keys: [], parsable: false };
  const body = args.slice(braceStart + 1, braceEnd);
  const keyRe = /(?:^|[,{])\s*(?:\.\.\.[^\s,]+|['"]?([A-Za-z0-9_$]+)['"]?\s*:)/g;
  const keys = [];
  let match;
  while ((match = keyRe.exec(body)) !== null) {
    if (match[1]) keys.push(match[1]);
  }
  return { keys, parsable: true };
}

function findMatchingBrace(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --- Load the registry ------------------------------------------------------

let journalSource;
try {
  journalSource = readFileSync(JOURNAL_FILE, 'utf-8');
} catch {
  console.error(`✖ Cannot read ${path.relative(ROOT, JOURNAL_FILE)} — decision-journal registry missing`);
  process.exit(1);
}

const registryPoints = parseRegistryPoints(journalSource);
if (registryPoints.length === 0) {
  console.error(
    `✖ ${path.relative(ROOT, JOURNAL_FILE)}: could not parse any keys out of DECISION_POINTS — regex drifted from the source shape`
  );
  process.exit(1);
}
const registrySet = new Set(registryPoints);

// --- Scan the repo for call sites -------------------------------------------

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).filter(
  (f) => f !== JOURNAL_FILE
);

const unknownPointViolations = [];
const timeShapedInputViolations = [];
const unparsableCalls = [];
const testFileViolations = [];
const pointsWithCallSites = new Set();

for (const file of files) {
  const relFile = path.relative(ROOT, file);
  const content = readFileSync(file, 'utf-8');
  if (!content.includes('recordDecision')) continue;

  const calls = findRecordDecisionCalls(content);
  const isVitestFile =
    (file.endsWith('.vitest.ts') || file.endsWith('.vitest.tsx')) &&
    !RECORD_DECISION_TEST_ALLOWLIST.has(relFile);

  for (const call of calls) {
    if (isVitestFile) {
      testFileViolations.push({ file: relFile, line: call.line });
      continue;
    }

    if (!call.parsable) {
      unparsableCalls.push({ file: relFile, line: call.line, reason: 'unbalanced parentheses' });
      continue;
    }

    if (call.point === null) {
      unparsableCalls.push({
        file: relFile,
        line: call.line,
        reason: 'first argument is not a string literal',
      });
      continue;
    }

    if (!registrySet.has(call.point)) {
      unknownPointViolations.push({ file: relFile, line: call.line, point: call.point });
    } else {
      pointsWithCallSites.add(call.point);
    }

    const { keys, parsable } = findInputsKeys(call.args);
    if (!parsable) {
      unparsableCalls.push({
        file: relFile,
        line: call.line,
        reason: 'inputs object literal has unbalanced braces',
      });
      continue;
    }
    for (const key of keys) {
      if (TIME_SHAPED_KEY_RE.test(key)) {
        timeShapedInputViolations.push({ file: relFile, line: call.line, key });
      }
    }
  }
}

const pointsWithoutCallSites = registryPoints.filter((p) => !pointsWithCallSites.has(p));

// --- Report ------------------------------------------------------------------

let failed = false;

if (unknownPointViolations.length > 0) {
  failed = true;
  console.error('\n✖ recordDecision() call uses a point id not in DECISION_POINTS\n');
  for (const v of unknownPointViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(
      `    '${v.point}' is not declared in apps/api/utils/decisionJournal.ts — add it to DECISION_POINTS or fix the typo.\n`
    );
  }
}

if (timeShapedInputViolations.length > 0) {
  failed = true;
  console.error('\n✖ recordDecision() inputs key looks time-shaped\n');
  for (const v of timeShapedInputViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(
      `    inputs key '${v.key}' matches /ms$|time|date|latency|duration/i — a time value there turns every run into a diff against the last one; drop it from inputs.\n`
    );
  }
}

if (testFileViolations.length > 0) {
  failed = true;
  console.error('\n✖ recordDecision() called from a *.vitest.ts file\n');
  for (const v of testFileViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(
      '    The journal is production instrumentation — a test writing its own entries falsifies the decision map it describes. Assert against recorded entries instead of writing new ones.\n'
    );
  }
}

if (unparsableCalls.length > 0) {
  failed = true;
  console.error('\n✖ recordDecision() call could not be parsed with confidence\n');
  for (const v of unparsableCalls) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Reason: ${v.reason}. Not skipped silently — rewrite the call so it can be checked.\n`);
  }
}

if (pointsWithoutCallSites.length > 0) {
  failed = true;
  console.error('\n✖ Registry point has no recordDecision() call site\n');
  for (const point of pointsWithoutCallSites) {
    console.error(`  ${point}`);
    console.error(
      `    Declared in DECISION_POINTS but never recorded anywhere under ${SOURCE_DIRS.join('/, ')}/ — a point nobody journals is dead registry. Wire up a call site or remove the point.\n`
    );
  }
}

if (failed) process.exit(1);

console.log(
  `✓ No decision-journal violations (${registryPoints.length} registry points, all with call sites, ${files.length} files scanned)`
);
process.exit(0);
