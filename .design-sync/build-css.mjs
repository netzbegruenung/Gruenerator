#!/usr/bin/env node
// Compiles a focused, static Tailwind v4 stylesheet for @gruenerator/ui that
// the design-sync bundle ships as cfg.cssEntry.
//
// Why this exists: @gruenerator/ui ships no compiled CSS — it's a Tailwind v4
// component library whose tokens (--primary-*, --grey-*, semantic colors) live
// in apps/web's theme. The claude.ai/design environment serves styles.css
// statically (no Tailwind build), so we must pre-compile.
//
// We start from the web app's index.css (the source of the @theme mapping,
// dark variant, keyframes and token values) but TIGHTEN it to ui only:
//  - keep only the foundational @imports (tailwindcss + common/{reset,
//    variables,typography,global}.css); drop app-chrome CSS (sidebar, forms,
//    markdown, pages) and other packages' CSS (chat, docs) — those pull in
//    tokens/fonts (e.g. "Ubuntu Mono", --tanne) that @gruenerator/ui never uses.
//  - scope @source to packages/ui/src only, so Tailwind emits exactly the
//    utility classes ui uses — nothing from the rest of the monorepo.
//
// Two import quirks we work around:
//  1. `@import url('./common/variables.css')` (url() form) is NOT inlined by
//     Tailwind's importer, so token *values* go missing. We rewrite
//     `@import url('x')` -> bare `@import "x"`, which Tailwind inlines.
//  2. typography.css carries @font-face with web-app-relative paths that would
//     404 from the bundle. We strip @font-face and let the converter ship
//     fonts via cfg.extraFonts instead.
//
// Output: packages/ui/dist/ds-styles.css (dist/ is gitignored). cfg.cssEntry
// points at it. Run before package-build.mjs (wired via cfg.buildCmd).

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'apps/web/src/assets/styles/index.css');
const STYLES_DIR = dirname(SRC);
const TMP_INPUT = join(STYLES_DIR, '.ds-sync-tw-input.css');
const OUT = join(REPO, 'packages/ui/dist/ds-styles.css');
const CLI = join(REPO, 'node_modules/.bin/tailwindcss');

// Foundational stylesheets to keep (everything ui's tokens/type need). Any
// other @import (app chrome, other packages) is dropped.
const KEEP_IMPORT = /tailwindcss|\/common\/(reset|variables|typography|global)\.css/;

const original = readFileSync(SRC, 'utf8');
const dropped = [];
const lines = original.split('\n').map((line) => {
  // 1. url() imports -> bare string imports so Tailwind inlines them.
  let l = line.replace(/@import\s+url\(\s*(['"])(.*?)\1\s*\)/g, (_m, _q, p) => `@import "${p}"`);

  // 1b. Disable Tailwind's automatic source detection (which would scan from
  //     this input file's dir up to the git root and pull in apps/web classes
  //     like bg-[var(--tanne)]). Only the explicit @source packages/ui below
  //     should drive class generation.
  l = l.replace(/@import\s+"tailwindcss"\s*;/, '@import "tailwindcss" source(none);');

  // 2. Drop non-foundational @imports (app chrome + other packages).
  if (/^\s*@import\b/.test(l) && !KEEP_IMPORT.test(l)) {
    dropped.push(l.trim());
    return '';
  }
  // 3. Keep only the packages/ui @source; drop every other source root so
  //    Tailwind emits classes used by ui, not the whole monorepo.
  if (/^\s*@source\b/.test(l) && !/packages\/ui\//.test(l)) {
    dropped.push(l.trim());
    return '';
  }
  return l;
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(TMP_INPUT, lines.join('\n'));

try {
  execFileSync(CLI, ['-i', TMP_INPUT, '-o', OUT], { stdio: 'inherit' });
} finally {
  rmSync(TMP_INPUT, { force: true });
}

// 4. Strip @font-face (fonts ship via cfg.extraFonts) and any @import that
//    survived inlining (would 404 in the static design environment).
let css = readFileSync(OUT, 'utf8');
const beforeFonts = (css.match(/@font-face/g) || []).length;
css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
const leftoverImports = css.match(/^\s*@import[^;]*;/gm) || [];
css = css.replace(/^\s*@import[^;]*;\s*$/gm, '');
writeFileSync(OUT, css);

const kb = (Buffer.byteLength(css) / 1024).toFixed(0);
const hasPrimary = css.includes('#52907A') || /--primary-500:/.test(css);
console.error(`[build-css] wrote ${OUT} (${kb} KB)`);
console.error(`[build-css] dropped ${dropped.length} non-foundational @import/@source line(s)`);
console.error(`[build-css] stripped @font-face: ${beforeFonts}; stripped leftover @import: ${leftoverImports.length}`);
console.error(`[build-css] primary-500 token value present: ${hasPrimary ? 'yes' : 'NO — investigate'}`);
if (leftoverImports.length) console.error('[build-css] leftover imports:\n  ' + leftoverImports.join('\n  '));
