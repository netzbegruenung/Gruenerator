/**
 * The reverse map that decides which docs a PR gets audited against.
 *
 * Worth testing because its failure is silent in the worst way: a missing entry
 * does not error, it makes `docs-freshness-pr.yml` run, find no affected folder,
 * print "nothing to audit" and exit green. It has happened twice — Office (fixed
 * when noticed) and the provider/energy claims (found in 08/2026, when Mistral
 * Medium moved off Scaleway and both the model page and the sustainability page
 * kept naming the old host through the PR that moved it).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AREA_HINTS, foldersForChangedFiles, SCOPE_FOLDERS } from './docsFreshnessAreas.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/docs-freshness-pr.yml');

/**
 * The `paths:` entries of the workflow's `pull_request` trigger.
 *
 * Hand-parsed rather than through a YAML library: neither `yaml` nor `js-yaml`
 * is a declared dependency of this workspace, and a test is a poor place to
 * acquire one. The shape is fixed, and a failed parse throws instead of
 * returning an empty list — otherwise every assertion below would pass
 * vacuously the day someone reformats the file.
 */
function workflowPathFilters(): string[] {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf-8');
  const block = /\n {4}paths:\n((?: {6}(?:-|#)[^\n]*\n)+)/.exec(yaml);
  if (!block) throw new Error(`No 'paths:' block found in ${WORKFLOW_PATH}`);
  const entries = block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) =>
      line
        .slice(2)
        .replace(/#.*$/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
    );
  if (entries.length === 0) throw new Error('Parsed the paths block but found no entries');
  return entries;
}

describe('AREA_HINTS coverage', () => {
  it('gives every audited doc folder a hint', () => {
    // A folder in SCOPE_FOLDERS but not here is audited weekly and NEVER on a
    // PR — half the coverage it looks like it has, with nothing to show for the
    // missing half.
    const missing = SCOPE_FOLDERS.filter((folder) => !AREA_HINTS[folder]);
    expect(missing).toEqual([]);
  });

  it('has a workflow paths: filter for every hint path', () => {
    // The same silent miss one step earlier: the reverse map can only choose
    // among the PRs the workflow runs on at all. A hint path with no matching
    // `paths:` entry means the job never starts, so the folder is never audited
    // no matter how correct the map is. Three entries sat in exactly that state
    // (routes/mcp-server, packages/sheets, packages/docs) until 08/2026.
    //
    // GitHub Actions has no YAML anchors, so the two lists are separate copies
    // by necessity — which is precisely why they need a test and not a comment.
    const filters = workflowPathFilters().map((p) => p.replace(/\/\*\*$/, ''));
    const uncovered: string[] = [];

    for (const [folder, csv] of Object.entries(AREA_HINTS)) {
      for (const prefix of csv.split(',').map((s) => s.trim())) {
        // A filter covers a hint when it is the hint itself or an ancestor of
        // it: 'apps/web/src/**' covers 'apps/web/src/features/chat'.
        const covered = filters.some(
          (filter) => prefix === filter || prefix.startsWith(`${filter}/`)
        );
        if (!covered) uncovered.push(`${folder} → ${prefix}`);
      }
    }

    expect(uncovered).toEqual([]);
  });

  it('lists every hint path repo-relative, so startsWith can match', () => {
    // Changed files arrive from `git diff --name-only`, i.e. repo-relative. A
    // leading './' or '/' would match nothing and disable that path in silence.
    // A bare leading dot is fine and load-bearing — '.env.example' is one.
    for (const [folder, csv] of Object.entries(AREA_HINTS)) {
      for (const prefix of csv.split(',').map((s) => s.trim())) {
        expect(prefix, `${folder} → ${prefix}`).not.toMatch(/^(\.\/|\/)/);
      }
    }
  });
});

describe('foldersForChangedFiles', () => {
  it('routes a provider-routing change to the pages that name providers', () => {
    // The 08/2026 case: Mistral Medium moved off Scaleway. Three pages carry
    // that claim — the model page (chat/ki-modelle.md), the sustainability page
    // (basics/nachhaltigkeit.md) and the README's provider list.
    const folders = foldersForChangedFiles([
      'apps/api/services/ai/providerInstances.ts',
      'apps/api/services/ai/regoloReasoningStream.ts',
    ]);

    expect(folders).toEqual(expect.arrayContaining(['chat', 'basics', 'readme']));
  });

  it('routes an energy-coefficient change to the sustainability page', () => {
    // A single file, not a directory — the prefix match has to cover it.
    expect(foldersForChangedFiles(['apps/api/services/usage/energyFootprint.ts'])).toContain(
      'basics'
    );
  });

  it('does not claim a sibling whose name merely starts with a hint path', () => {
    // `apps/api/services/aiSearchAgent.ts` sat next to the `services/ai`
    // directory until it was deleted as a dead service (16.08.2026) — it was
    // the repo's only such collision. A bare startsWith would pull chat/,
    // basics/ and readme/ into the audit every time such a
    // sibling is edited, so the boundary check outlives its example.
    expect(foldersForChangedFiles(['apps/api/services/aiSearchAgent.ts'])).toEqual([]);
    // …while the directory itself still matches.
    expect(foldersForChangedFiles(['apps/api/services/ai/providers.ts'])).toContain('chat');
  });

  it('matches the root manifest but not a workspace one', () => {
    // `package.json` is a bare prefix on purpose: repo-relative paths mean only
    // the root manifest starts with it. A workspace manifest must not drag the
    // README audit in on every dependency bump.
    expect(foldersForChangedFiles(['package.json'])).toContain('readme');
    expect(foldersForChangedFiles(['apps/mobile/package.json'])).not.toContain('readme');
  });

  it('returns nothing for a change no doc folder claims', () => {
    expect(foldersForChangedFiles(['apps/api/database/postgres/migrations/0042_foo.sql'])).toEqual(
      []
    );
  });
});
