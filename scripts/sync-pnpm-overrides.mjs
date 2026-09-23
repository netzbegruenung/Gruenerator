#!/usr/bin/env node
/**
 * Keeps the `overrides:` block in pnpm-workspace.yaml and the one in
 * pnpm-lock.yaml in agreement.
 *
 * Why this exists: Dependabot cannot edit pnpm's `overrides`. When it bumps a
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
 *   --fix    copy the lockfile's values into pnpm-workspace.yaml — i.e. adopt the
 *            bump Dependabot already resolved. Follow with `pnpm install` to
 *            let pnpm re-derive the tree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// REPO_ROOT lets the workflow run a copy of this script (taken from the base
// branch, so never the PR's own code) against a checked-out PR branch.
const repoRoot = process.env.REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'pnpm-workspace.yaml');
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
 * Both pnpm-lock.yaml and pnpm-workspace.yaml carry `overrides:` as a flat
 * top-level mapping, so a two-line parser beats pulling a YAML dependency in —
 * this has to run before install.
 */
const readOverridesBlock = (text) => {
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
const manifestOverrides = readOverridesBlock(manifestText);
const lockfileOverrides = readOverridesBlock(readFileSync(lockPath, 'utf8'));

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
  console.log('✓ overrides in pnpm-workspace.yaml match pnpm-lock.yaml (%d entries)', Object.keys(manifestOverrides).length);
  process.exit(0);
}

for (const entry of drifted) {
  console.log(`  ${entry.name}: pnpm-workspace.yaml ${entry.manifest} ↔ lockfile ${entry.lockfile}`);
}
for (const name of missingInLockfile) {
  console.log(`  ${name}: in pnpm-workspace.yaml, absent from lockfile`);
}
for (const name of missingInManifest) {
  console.log(`  ${name}: in lockfile, absent from pnpm-workspace.yaml`);
}

if (!fix) {
  console.error(
    '\n✖ pnpm-workspace.yaml overrides and pnpm-lock.yaml disagree — `pnpm install --frozen-lockfile`\n' +
      '  will fail with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.\n\n' +
      '  Usual cause: Dependabot bumped a package pinned in pnpm-workspace.yaml.\n' +
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

// Rewrite the one line in place rather than re-serialising the YAML — the file
// is comment-heavy and a full round-trip would drop every rationale in it.
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A value only needs quoting when it would otherwise parse as something else;
// keep whatever style the existing line used.
let patched = manifestText;
for (const entry of drifted) {
  const needle = new RegExp(
    `^( {2}'?${esc(entry.name)}'?: )(['"]?)${esc(entry.manifest)}\\2$`,
    'm'
  );
  const next = patched.replace(needle, (_m, head, quote) => `${head}${quote}${entry.lockfile}${quote}`);
  if (next === patched) {
    console.error(`✖ could not locate ${entry.name}: ${entry.manifest} in pnpm-workspace.yaml`);
    process.exit(1);
  }
  patched = next;
}
writeFileSync(manifestPath, patched);
console.log(
  '\n✓ pnpm-workspace.yaml overrides updated to the lockfile values (%d).\n' +
    '  Now run: pnpm install --no-frozen-lockfile\n',
  drifted.length
);
