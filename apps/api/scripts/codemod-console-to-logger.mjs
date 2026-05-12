#!/usr/bin/env node
/**
 * One-shot codemod: rewrites raw console.* calls in apps/api source to the
 * project's Winston-backed logger (createLogger from utils/logger.ts).
 *
 *   console.log   -> log.debug    (routine traces -> hidden at LOG_LEVEL=info)
 *   console.info  -> log.info
 *   console.warn  -> log.warn
 *   console.error -> log.error    (multi-arg sites flagged for manual triage)
 *   console.debug -> log.debug
 *
 * Skips:
 *   - apps/api/scripts/**, test/**, tests/**, *.test.ts, *.vitest.ts, test-*.ts
 *   - Top-level CLI-style scripts (scrape-*, backfill-*, diagnose-*, etc.)
 *   - Config files (drizzle.config, vitest.config, worker.config)
 *
 * Idempotent: re-runs are no-ops once a file is fully converted.
 *
 * Run:  node apps/api/scripts/codemod-console-to-logger.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'scripts', 'test', 'tests', '__tests__']);
const SKIP_BASENAME_RE =
  /^(test-.*\.ts$|.*\.(test|vitest|manual-test)\.ts$|drizzle\.config\.ts$|vitest\.config\.ts$|worker\.config\.ts$)/;
const SKIP_ROOT_PREFIXES = [
  'scrape-',
  'backfill-',
  'diagnose-',
  'patch-',
  'sync-',
  'aggregate-',
  'generate-',
  'update-all-content',
  'debug-',
  'fix-',
  'export-',
  'reprocess-',
  'test-',
  'run-',
  'migrate-',
  'recheck-',
  'recompute-',
];

const LEVEL_MAP = { log: 'debug', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
const CONSOLE_RE = /(^|[^a-zA-Z0-9_$.])(console)\.(log|info|warn|error|debug)\s*\(/g;
const EMOJI_PREFIX_RE =
  /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✓✗]+\s*)+/u;

const stats = {
  filesChanged: 0,
  filesScanned: 0,
  importsAdded: 0,
  declsAdded: 0,
  calls: { debug: 0, info: 0, warn: 0, error: 0 },
  emojisStripped: 0,
};
const flaggedErrorSites = [];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(p);
    } else if (entry.name.endsWith('.ts')) {
      yield p;
    }
  }
}

function isRootScript(relPath) {
  const parts = relPath.split(sep);
  if (parts.length !== 1) return false;
  return SKIP_ROOT_PREFIXES.some((p) => parts[0].startsWith(p));
}

function flagMultiArgErrors(text, relPath) {
  // Look for log.error( with comma at top level of the first argument list —
  // likely a 2-arg `console.error('msg', err)` that should become structured.
  for (const m of text.matchAll(/\blog\.error\(/g)) {
    let depth = 1;
    let inStr = null;
    let esc = false;
    let hasComma = false;
    for (let j = m.index + m[0].length; j < Math.min(m.index + 800, text.length); j++) {
      const c = text[j];
      if (esc) {
        esc = false;
        continue;
      }
      if (inStr) {
        if (c === '\\') esc = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inStr = c;
        continue;
      }
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') {
        depth--;
        if (depth === 0) break;
      } else if (c === ',' && depth === 1) {
        hasComma = true;
        break;
      }
    }
    if (hasComma) {
      const line = text.slice(0, m.index).split('\n').length;
      flaggedErrorSites.push(`${relPath}:${line}`);
    }
  }
}

function injectLogger(text, file) {
  const hasImport = /from\s+['"][^'"]*\/utils\/logger(\.js)?['"]/.test(text);
  const hasDecl = /\bconst\s+log\s*=\s*createLogger\s*\(/.test(text);
  if (hasImport && hasDecl) return text;

  const fileDir = dirname(file);
  let importPath = relative(fileDir, join(API_ROOT, 'utils/logger')).replace(/\\/g, '/');
  if (!importPath.startsWith('.')) importPath = './' + importPath;
  importPath += '.js';

  const moduleName = basename(file, '.ts');

  const lines = text.split('\n');
  let lastImportLine = -1;
  let inMultilineImport = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^import\s+/.test(l)) {
      lastImportLine = i;
      inMultilineImport = !/;[\s]*$/.test(l) && !/from\s+['"][^'"]+['"];?\s*$/.test(l);
    } else if (inMultilineImport) {
      lastImportLine = i;
      if (/;[\s]*$/.test(l)) inMultilineImport = false;
    } else if (/^\s*$/.test(l)) {
      // blank line — keep scanning
    } else if (lastImportLine === -1 && /^\s*(\/\/|\/\*|\*)/.test(l)) {
      // leading comment/jsdoc — keep scanning
    } else if (lastImportLine !== -1) {
      break;
    }
  }

  const newImport = hasImport ? null : `import { createLogger } from '${importPath}';`;
  const newDecl = hasDecl ? null : `const log = createLogger('${moduleName}');`;

  if (newImport) stats.importsAdded++;
  if (newDecl) stats.declsAdded++;

  if (lastImportLine === -1) {
    const out = [];
    if (newImport) out.push(newImport);
    out.push('');
    if (newDecl) out.push(newDecl, '');
    return out.join('\n') + text;
  }

  const before = lines.slice(0, lastImportLine + 1);
  const after = lines.slice(lastImportLine + 1);
  while (after.length && after[0].trim() === '') after.shift();

  const inserted = [];
  if (newImport) inserted.push(newImport);
  inserted.push('');
  if (newDecl) inserted.push(newDecl, '');

  return [...before, ...inserted, ...after].join('\n');
}

for (const file of walk(API_ROOT)) {
  const rel = relative(API_ROOT, file);
  if (isRootScript(rel)) continue;
  if (SKIP_BASENAME_RE.test(basename(file))) continue;

  stats.filesScanned++;
  const orig = readFileSync(file, 'utf8');
  if (!CONSOLE_RE.test(orig)) {
    CONSOLE_RE.lastIndex = 0;
    continue;
  }
  CONSOLE_RE.lastIndex = 0;

  let changed = orig.replace(CONSOLE_RE, (_m, lead, _c, method) => {
    const mapped = LEVEL_MAP[method];
    stats.calls[mapped]++;
    return `${lead}log.${mapped}(`;
  });

  // Strip emoji prefix from first string arg of every log.X( call.
  changed = changed.replace(
    /(\blog\.(?:debug|info|warn|error)\(\s*)(['"`])((?:\\.|(?!\2).)*?)\2/g,
    (m, prefix, q, body) => {
      const stripped = body.replace(EMOJI_PREFIX_RE, '');
      if (stripped === body) return m;
      stats.emojisStripped++;
      return `${prefix}${q}${stripped}${q}`;
    }
  );

  flagMultiArgErrors(changed, rel);

  changed = injectLogger(changed, file);

  if (changed !== orig) {
    writeFileSync(file, changed);
    stats.filesChanged++;
  }
}

console.log('\n=== console -> logger codemod ===');
console.log(`Files scanned:    ${stats.filesScanned}`);
console.log(`Files changed:    ${stats.filesChanged}`);
console.log(`Imports added:    ${stats.importsAdded}`);
console.log(`Decls added:      ${stats.declsAdded}`);
console.log(`Emoji prefixes stripped: ${stats.emojisStripped}`);
console.log('Calls converted:');
for (const [k, v] of Object.entries(stats.calls)) {
  console.log(`  log.${k.padEnd(5)} ${v}`);
}
console.log(`\nFlagged log.error sites with 2+ args (review for { error } wrapping):`);
if (flaggedErrorSites.length === 0) {
  console.log('  (none)');
} else {
  for (const s of flaggedErrorSites) console.log(`  ${s}`);
}
console.log(`\nTotal flagged: ${flaggedErrorSites.length}`);
