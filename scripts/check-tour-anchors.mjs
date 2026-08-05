#!/usr/bin/env node
// Tour-anchor drift guard (tour equivalent of the UiLabel manifest check).
//
// The in-app tours (apps/web/src/features/tours/*Tour.ts) highlight elements
// via `[data-tour="..."]` selectors. When a component is refactored and its
// `data-tour` attribute is renamed or dropped, the tour breaks silently:
// waitForElement times out and the step never shows. This script fails CI when
// the two sides drift:
//   - a tour references a selector no JSX defines  → broken tour step
//   - JSX defines an anchor no tour references     → leftover to clean up
//
// No dependencies — runs before `pnpm install` in the Quality job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOURS_DIR = path.join(ROOT, 'apps/web/src/features/tours');
// All trees that may carry data-tour attributes in JSX.
const SOURCE_DIRS = ['apps/web/src', 'packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage']);

function walk(dir, ext, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    // stat folgt Symlinks. In apps/mobile/ios/Pods stehen CocoaPods-Symlinks
    // nach node_modules; zeigt einer ins Leere, warf der Lauf bisher ENOENT und
    // brach ab — lokal rot, in der CI grün, weil ios/ dort gitignored ist.
    // Gültige Symlinks sollen weiter verfolgt werden, tote nur übersprungen.
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, ext, out);
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function collect(files, regex) {
  const found = new Map(); // anchor -> first file
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(regex)) {
      if (!found.has(match[1])) found.set(match[1], path.relative(ROOT, file));
    }
  }
  return found;
}

// Selectors the tours target: [data-tour="..."] inside features/tours/*.ts
const referenced = collect(walk(TOURS_DIR, ['.ts'], []), /\[data-tour="([^"]+)"\]/g);

// Anchors the UI defines (.tsx only — the tour modules themselves are .ts, so
// their selector strings never count as definitions). Three shapes:
//   data-tour="x"          static JSX attribute
//   dataTour="x"           prop forwarded to a shared component's data-tour
//   data-tour={`x-${id}`}  dynamic — matched as prefix wildcard
const sourceFiles = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), ['.tsx'], []));
const defined = collect(sourceFiles, /data-tour="([^"]+)"/g);
for (const [anchor, file] of collect(sourceFiles, /\bdataTour="([^"]+)"/g)) {
  if (!defined.has(anchor)) defined.set(anchor, file);
}
const dynamicPrefixes = collect(sourceFiles, /data-tour=\{`([^`$]+)\$\{[^`]*\}`\}/g);

const isDefined = (anchor) =>
  defined.has(anchor) || [...dynamicPrefixes.keys()].some((p) => anchor.startsWith(p));

const missing = [...referenced].filter(([anchor]) => !isDefined(anchor));
const orphans = [...defined].filter(([anchor]) => !referenced.has(anchor));

if (missing.length === 0 && orphans.length === 0) {
  console.log(`✓ tour anchors in sync (${referenced.size} anchors)`);
  process.exit(0);
}

for (const [anchor, file] of missing) {
  console.error(
    `✗ ${file} targets [data-tour="${anchor}"] but no JSX defines it — the tour step will never show. Restore the attribute or update/remove the step.`
  );
}
for (const [anchor, file] of orphans) {
  console.error(
    `✗ ${file} defines data-tour="${anchor}" but no tour references it — remove the attribute or add the step back.`
  );
}
process.exit(1);
