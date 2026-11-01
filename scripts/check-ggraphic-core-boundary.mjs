#!/usr/bin/env node
/**
 * Guards packages/ggraphic-*: the brand-neutral core that will leave this repo
 * as the open-source project ggraphic. Nothing from the Greens may ride along —
 * party wording, CD colours, brand fonts and logos, people's names, references
 * to the private repo — and no asset without a license entry. The denylist
 * lives here, not in the core, because it names the party itself.
 *
 * Rules (scripts/ggraphic-boundary/rules.mjs): (a) identity text, imports out
 * of the package and symlinks, (b) CD hex colours, (c) brand file names,
 * (d) binaries only via assets.json, font name tables, no inline base64
 * assets, (e) no root-relative asset or API paths, (f) MPL-2.0 SPDX header,
 * (g) no test fixture (`__fixtures__/`) imported by production code.
 * An empty match fails too.
 *
 * `--self-test` runs the red probes (scripts/ggraphic-boundary/selfTest.mjs).
 * No dependencies — runs on bare node in the Guards job.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_PATHSPEC, checkFiles } from './ggraphic-boundary/rules.mjs';
import { PROBE_COUNT, runSelfTest } from './ggraphic-boundary/selfTest.mjs';

if (process.argv.includes('--self-test')) {
  const problems = runSelfTest();
  if (problems.length > 0) {
    console.error('✖ ggraphic boundary self-test failed:');
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exit(1);
  }
  console.log(`✓ ggraphic boundary self-test: ${PROBE_COUNT} probes ok`);
  process.exit(0);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = [];
for (const path of execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', CORE_PATHSPEC],
  { cwd: ROOT, encoding: 'utf8' }
).split('\0')) {
  const full = join(ROOT, path);
  // lstat, not exists: a dangling symlink must not vanish from the check.
  const stat = path ? lstatSync(full, { throwIfNoEntry: false }) : undefined;
  if (!stat) continue; // deleted in the working tree
  files.push(
    stat.isSymbolicLink()
      ? { path, bytes: Buffer.alloc(0), link: readlinkSync(full) }
      : { path, bytes: readFileSync(full) }
  );
}

const { failures, warnings } = checkFiles(files);

for (const warning of warnings) console.warn(`⚠ ${warning.path}: ${warning.message}`);

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} brand or license leak(s) in ${CORE_PATHSPEC}:\n`);
  for (const failure of failures)
    console.error(`  [${failure.rule}] ${failure.path}: ${failure.message}`);
  console.error('\nBrand content belongs in a Grünerator brand pack, not in the neutral core.');
  process.exit(1);
}

console.log(`✓ ${files.length} file(s) in ${CORE_PATHSPEC} brand-neutral`);
