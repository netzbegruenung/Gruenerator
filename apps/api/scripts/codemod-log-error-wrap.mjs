#!/usr/bin/env node
/**
 * Triage codemod: wraps the bare-identifier 2nd-arg form
 *
 *   log.error('msg', err)         -> log.error('msg', { error: err })
 *   log.error('msg', error)       -> log.error('msg', { error })
 *   log.error('msg', e)           -> log.error('msg', { error: e })
 *
 * This lets utils/logger.ts's formatter (which only unpacks `instanceof Error`
 * values inside the `...rest` meta object) actually surface stacks.
 *
 * Conservative: only handles single-line, single-identifier-2nd-arg cases
 * where the identifier matches /^(err|error|e|cause|reason)$/. Anything else
 * (member access, function call, multi-line, second-arg-is-object) is left
 * alone — that's the intended safety net.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'scripts', 'test', 'tests', '__tests__']);
const SKIP_BASENAME_RE = /^(test-.*\.ts$|.*\.(test|vitest|manual-test)\.ts$)/;

const ERROR_IDENT_RE = /^(err|error|e|cause|reason|ex)$/;

// Match: log.error( <string|template> , <ident> )   on a single line
// Captures: full prefix incl. msg arg, the identifier, closing paren+rest
const CALL_RE =
  /(\blog\.error\(\s*(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)\s*,\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*\)(?!\s*=>))/g;

let filesChanged = 0;
let callsWrapped = 0;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(p);
    } else if (entry.name.endsWith('.ts')) yield p;
  }
}

for (const file of walk(API_ROOT)) {
  if (SKIP_BASENAME_RE.test(basename(file))) continue;
  const rel = file.slice(API_ROOT.length + 1);
  // Skip top-level CLI scripts
  if (!rel.includes(sep)) {
    const prefixes = [
      'scrape-', 'backfill-', 'diagnose-', 'patch-', 'sync-',
      'aggregate-', 'generate-', 'update-all-content', 'debug-',
      'fix-', 'export-', 'reprocess-', 'test-', 'run-',
      'migrate-', 'recheck-', 'recompute-',
    ];
    if (prefixes.some((p) => rel.startsWith(p))) continue;
  }

  const orig = readFileSync(file, 'utf8');
  if (!orig.includes('log.error(')) continue;

  let count = 0;
  const next = orig.replace(CALL_RE, (m, lead, ident, tail) => {
    if (!ERROR_IDENT_RE.test(ident)) return m;
    count++;
    const wrapped = ident === 'error' ? '{ error }' : `{ error: ${ident} }`;
    return `${lead}${wrapped}${tail}`;
  });

  if (next !== orig) {
    writeFileSync(file, next);
    filesChanged++;
    callsWrapped += count;
  }
}

console.log(`\n=== log.error error-wrap codemod ===`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Calls wrapped: ${callsWrapped}`);
