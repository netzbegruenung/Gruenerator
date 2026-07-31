#!/usr/bin/env node
/**
 * Keeps `pnpm.overrides` in package.json and the `overrides:` block in
 * pnpm-lock.yaml in agreement.
 *
 * Why this exists: Dependabot cannot edit `pnpm.overrides`. When it bumps a
 * package that is ALSO pinned there (jsdom, @assistant-ui/*, @tiptap/*,
 * @blocknote/*, katex, pyodide, @types/node …), it regenerates the lockfile
 * with the NEW override value but leaves package.json on the OLD one. Every
 * CI job then dies in the very first step with
 *
 *   ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen
 *   installation. The current "overrides" configuration doesn't match the
 *   value found in the lockfile
 *
 * — which reads like a corrupt lockfile but is a one-line manifest edit.
 * See PR #2097 (@assistant-ui/react-markdown) and #2098 (jsdom).
 *
 * Modes:
 *   --check  (default) report mismatches, exit 1 if any. Runs on bare node
 *            before `pnpm install`, so CI reports the real cause.
 *   --fix    copy the lockfile's values into package.json — i.e. adopt the
 *            bump Dependabot already resolved. Follow with `pnpm install` to
 *            let pnpm re-derive the tree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// REPO_ROOT lets the workflow run a copy of this script (taken from the base
// branch, so never the PR's own code) against a checked-out PR branch.
const repoRoot = process.env.REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'package.json');
const lockPath = join(repoRoot, 'pnpm-lock.yaml');

const unquote = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/**
 * The lockfile's `overrides:` block is a flat top-level mapping, so a two-line
 * parser beats pulling a YAML dependency in — this has to run before install.
 */
const readLockfileOverrides = (text) => {
  const lines = text.split('\n');
  const start = lines.indexOf('overrides:');
  if (start === -1) return {};

  const overrides = {};
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (!line.startsWith('  ')) break; // dedent = block over
    const match = /^ {2}('[^']+'|"[^"]+"|[^:]+): (.+)$/.exec(line);
    if (!match) continue;
    overrides[unquote(match[1])] = unquote(match[2]);
  }
  return overrides;
};

const manifestText = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
const manifestOverrides = manifest.pnpm?.overrides ?? {};
const lockfileOverrides = readLockfileOverrides(readFileSync(lockPath, 'utf8'));

const drifted = [];
const missingInLockfile = [];
const missingInManifest = [];

for (const [name, version] of Object.entries(manifestOverrides)) {
  if (!(name in lockfileOverrides)) {
    missingInLockfile.push(name);
  } else if (lockfileOverrides[name] !== version) {
    drifted.push({ name, manifest: version, lockfile: lockfileOverrides[name] });
  }
}
for (const name of Object.keys(lockfileOverrides)) {
  if (!(name in manifestOverrides)) missingInManifest.push(name);
}

const clean = drifted.length === 0 && missingInLockfile.length === 0 && missingInManifest.length === 0;
const fix = process.argv.includes('--fix');

if (clean) {
  console.log('✓ pnpm.overrides matches pnpm-lock.yaml (%d entries)', Object.keys(manifestOverrides).length);
  process.exit(0);
}

for (const entry of drifted) {
  console.log(`  ${entry.name}: package.json ${entry.manifest} ↔ lockfile ${entry.lockfile}`);
}
for (const name of missingInLockfile) {
  console.log(`  ${name}: in package.json, absent from lockfile`);
}
for (const name of missingInManifest) {
  console.log(`  ${name}: in lockfile, absent from package.json`);
}

if (!fix) {
  console.error(
    '\n✖ pnpm.overrides and pnpm-lock.yaml disagree — `pnpm install --frozen-lockfile`\n' +
      '  will fail with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.\n\n' +
      '  Usual cause: Dependabot bumped a package that is pinned in pnpm.overrides.\n' +
      '  Fix: pnpm overrides:fix && pnpm install --no-frozen-lockfile\n'
  );
  process.exit(1);
}

if (drifted.length === 0) {
  console.error(
    '\n✖ Nothing --fix can do: the two files differ in which packages they\n' +
      '  override, not just in versions. Run `pnpm install --no-frozen-lockfile`\n' +
      '  and commit the lockfile.\n'
  );
  process.exit(1);
}

// Rewrite in place rather than via JSON.stringify — package.json is
// prettier-formatted and a full re-serialise would reflow the whole file.
let patched = manifestText;
for (const entry of drifted) {
  const needle = new RegExp(
    `("${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*)"${entry.manifest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
  );
  const next = patched.replace(needle, `$1"${entry.lockfile}"`);
  if (next === patched) {
    console.error(`✖ could not locate "${entry.name}": "${entry.manifest}" in package.json`);
    process.exit(1);
  }
  patched = next;
}
writeFileSync(manifestPath, patched);
console.log(
  '\n✓ package.json pnpm.overrides updated to the lockfile values (%d).\n' +
    '  Now run: pnpm install --no-frozen-lockfile\n',
  drifted.length
);
