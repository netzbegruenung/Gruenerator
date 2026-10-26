#!/usr/bin/env node
/**
 * Guards packages/ggraphic-*: the brand-neutral core that will leave this repo
 * as the open-source project ggraphic. Nothing from the Greens may ride along —
 * party wording, CD colours, brand fonts and logos, people's names, references
 * to the private repo — and no asset without a license entry. The denylist
 * lives here, not in the core, because it names the party itself.
 *
 * Rules (scripts/ggraphic-boundary/rules.mjs): (a) identity text and imports
 * out of the package, (b) CD hex colours, (c) brand file names, (d) binaries
 * only via assets.json, font name tables, no inline base64 assets, (e) no
 * root-relative asset or API paths, (f) MPL-2.0 SPDX header.
 *
 * `--self-test` runs the red probes (scripts/ggraphic-boundary/selfTest.mjs).
 * No dependencies — runs on bare node in the Guards job.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
const paths = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', CORE_PATHSPEC],
  { cwd: ROOT, encoding: 'utf8' }
)
  .split('\0')
  .filter((path) => path && existsSync(join(ROOT, path)));

const { failures, warnings } = checkFiles(
  paths.map((path) => ({ path, bytes: readFileSync(join(ROOT, path)) }))
);

for (const warning of warnings) console.warn(`⚠ ${warning.path}: ${warning.message}`);

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} brand or license leak(s) in ${CORE_PATHSPEC}:\n`);
  for (const failure of failures)
    console.error(`  [${failure.rule}] ${failure.path}: ${failure.message}`);
  console.error('\nBrand content belongs in a Grünerator brand pack, not in the neutral core.');
  process.exit(1);
}

console.log(`✓ ${paths.length} file(s) in ${CORE_PATHSPEC} brand-neutral`);
