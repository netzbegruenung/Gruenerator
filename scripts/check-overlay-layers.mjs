#!/usr/bin/env node
// Overlay z-index layer guard.
//
// Portalled surfaces (Dialog, Sheet, Popover, Combobox, Select, Menus,
// Tooltip) escape their DOM parent and land on <body>, so their stacking is
// decided purely by z-index against the rest of the app. shadcn/base-ui ship
// them all on Tailwind's default `z-50` — which in THIS codebase renders BELOW
// the sidebars (z-[1001] / z-[1005]) and below any open dialog (z-[1010]).
// The failure is silent and looks like a dead control: the popup paints behind
// the dialog, so it is visible-ish but unclickable (Bundesland-Combobox in the
// Rollen-Settings).
//
// The layer scale:
//   1001 / 1005  sidebars (app chrome, not checked here)
//   1010         MODAL   — dialog, alert-dialog, sheet + their overlays
//   1020         POPUP   — anything anchored that may open INSIDE a modal
//   1030         TOOLTIP — always on top
//
// Two rules:
//   1. No `z-50` (or any bare Tailwind z-scale utility) in a file that portals.
//   2. packages/ui's overlay components must carry exactly their mapped layer,
//      and a new portalling component there must be added to the map.
//
// No dependencies — runs on bare node in the Guards job, before install.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['apps/web/src', 'apps/docs/src', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.next',
  'coverage',
  '__snapshots__',
]);

const MODAL = 1010;
const POPUP = 1020;
const TOOLTIP = 1030;
const ALLOWED = new Set([MODAL, POPUP, TOOLTIP]);

// packages/ui/src/components/<file> -> required layer.
const UI_LAYERS = {
  'dialog.tsx': MODAL,
  'alert-dialog.tsx': MODAL,
  'sheet.tsx': MODAL,
  'popover.tsx': POPUP,
  'hover-card.tsx': POPUP,
  'combobox.tsx': POPUP,
  'select.tsx': POPUP,
  'dropdown-menu.tsx': POPUP,
  'context-menu.tsx': POPUP,
  'tooltip.tsx': TOOLTIP,
};

const PORTAL_RE = /\.Portal\b|<Portal\b/;
// `z-50`, `z-40`, … — Tailwind's built-in scale, all far below the sidebars.
const BARE_Z_RE = /(?<![\w-])z-(?:0|10|20|30|40|50)(?![\w-])/g;
const ARBITRARY_Z_RE = /(?<![\w-])z-\[(\d+)\]/g;

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
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

// Comments name the forbidden values while explaining them. Blank them out but
// keep the newlines so reported line numbers stay true.
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
const errors = [];
const seenUiComponents = new Set();

for (const file of files) {
  const content = stripComments(readFileSync(file, 'utf-8'));
  const rel = path.relative(ROOT, file);
  const portals = PORTAL_RE.test(content);
  const uiLayer = rel.startsWith('packages/ui/src/components/')
    ? UI_LAYERS[path.basename(file)]
    : undefined;

  if (portals && rel.startsWith('packages/ui/src/components/')) {
    seenUiComponents.add(path.basename(file));
    if (uiLayer === undefined) {
      errors.push(
        `${rel}: portalling component without a layer in UI_LAYERS — ` +
          `pick MODAL/POPUP/TOOLTIP and add it to scripts/check-overlay-layers.mjs`
      );
    }
  }

  if (portals) {
    for (const m of content.matchAll(BARE_Z_RE)) {
      errors.push(
        `${rel}:${lineOf(content, m.index)}: \`${m[0]}\` in a portalled surface — ` +
          `renders below the sidebars (z-[1001]/z-[1005]) and dialogs (z-[1010]). ` +
          `Use z-[${MODAL}] (modal), z-[${POPUP}] (popup) or z-[${TOOLTIP}] (tooltip).`
      );
    }
  }

  if (uiLayer !== undefined) {
    for (const m of content.matchAll(ARBITRARY_Z_RE)) {
      const value = Number(m[1]);
      // Sidebar values quoted in the explanatory comment are documentation.
      if (!ALLOWED.has(value)) continue;
      if (value !== uiLayer) {
        errors.push(
          `${rel}:${lineOf(content, m.index)}: \`${m[0]}\` but this component is ` +
            `mapped to layer ${uiLayer}. Change the map deliberately or fix the class.`
        );
      }
    }
  }
}

for (const name of Object.keys(UI_LAYERS)) {
  if (!seenUiComponents.has(name)) {
    errors.push(
      `packages/ui/src/components/${name}: listed in UI_LAYERS but no longer portals — ` +
        `remove it from scripts/check-overlay-layers.mjs`
    );
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Overlay layer guard: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ Overlay layers consistent (${files.length} .tsx files scanned)`);
