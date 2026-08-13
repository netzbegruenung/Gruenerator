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

import { describe, expect, it } from 'vitest';

import { AREA_HINTS, foldersForChangedFiles, SCOPE_FOLDERS } from './docsFreshnessAreas.js';

describe('AREA_HINTS coverage', () => {
  it('gives every audited doc folder a hint', () => {
    // A folder in SCOPE_FOLDERS but not here is audited weekly and NEVER on a
    // PR — half the coverage it looks like it has, with nothing to show for the
    // missing half.
    const missing = SCOPE_FOLDERS.filter((folder) => !AREA_HINTS[folder]);
    expect(missing).toEqual([]);
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
    // (ueber-den-gruenerator/nachhaltigkeit.md) and the README's provider list.
    const folders = foldersForChangedFiles([
      'apps/api/services/ai/providerInstances.ts',
      'apps/api/services/ai/regoloReasoningStream.ts',
    ]);

    expect(folders).toEqual(expect.arrayContaining(['chat', 'ueber-den-gruenerator', 'readme']));
  });

  it('routes an energy-coefficient change to the sustainability page', () => {
    // A single file, not a directory — the prefix match has to cover it.
    expect(foldersForChangedFiles(['apps/api/services/usage/energyFootprint.ts'])).toContain(
      'ueber-den-gruenerator'
    );
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
