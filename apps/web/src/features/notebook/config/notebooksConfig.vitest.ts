/**
 * Discovery vs. resolution on the web side.
 *
 * The gallery lists what the instance *offers*; route lookups resolve what it
 * merely *hides* as well, so a notebook link shared from another instance opens
 * instead of 404ing. Collapsing those two into one filtered array is the easy
 * mistake — this pins them apart.
 *
 * The tier behaviour itself is proven against a policy in
 * `apps/api/config/notebookCollectionMap.vitest.ts`; here the point is that both
 * sides read the same shared registry and that lookups never narrow further than
 * the listing.
 */
import { NOTEBOOK_REGISTRY, isNotebookOfferedIn } from '@gruenerator/shared/notebooks';
import { describe, expect, it } from 'vitest';

import { CURRENT_INSTANCE } from '../../../config/instance';

import {
  SYSTEM_NOTEBOOKS,
  getListedNotebookById,
  getNotebookById,
  getNotebookByPath,
} from './notebooksConfig';

describe('notebooksConfig — discovery', () => {
  it('lists exactly what this instance offers', () => {
    expect(SYSTEM_NOTEBOOKS.map((nb) => nb.id).sort()).toEqual(
      NOTEBOOK_REGISTRY.filter((nb) => isNotebookOfferedIn(nb.id, CURRENT_INSTANCE))
        .map((nb) => nb.id)
        .sort()
    );
  });

  it('drops notebooks on a channel this instance does not serve', () => {
    // `boell-stiftung-notebook` is `internal`, so it belongs to `local` only.
    const listed = SYSTEM_NOTEBOOKS.some((nb) => nb.id === 'boell-stiftung-notebook');
    expect(listed).toBe(isNotebookOfferedIn('boell-stiftung-notebook', CURRENT_INSTANCE));
  });
});

describe('notebooksConfig — listing lookup', () => {
  it('never returns a notebook this instance does not offer', () => {
    // The gallery picks a few tiles by id (Bundesverband, Bundestagsfraktion,
    // KommunalWiki). Using the *resolution* lookup there rendered a tile for a
    // notebook the instance policy had just hidden everywhere else.
    for (const nb of NOTEBOOK_REGISTRY) {
      if (isNotebookOfferedIn(nb.id, CURRENT_INSTANCE) && nb.enabled !== false) continue;
      expect(getListedNotebookById(nb.id)).toBeUndefined();
    }
  });

  it('returns every listed, enabled notebook', () => {
    for (const nb of SYSTEM_NOTEBOOKS) {
      if (nb.enabled === false) continue;
      expect(getListedNotebookById(nb.id)?.id).toBe(nb.id);
    }
  });
});

describe('notebooksConfig — resolution', () => {
  it('resolves every listed notebook by id and by path', () => {
    for (const nb of SYSTEM_NOTEBOOKS) {
      expect(getNotebookById(nb.id)?.id).toBe(nb.id);
      expect(getNotebookByPath(nb.path)?.id).toBe(nb.id);
    }
  });

  it('never resolves less than it lists', () => {
    // The regression this file exists for: were the lookups to read the filtered
    // gallery array, a merely hidden notebook would stop resolving — and a link
    // shared from another instance would die.
    const listed = new Set(SYSTEM_NOTEBOOKS.map((nb) => nb.id));
    for (const nb of NOTEBOOK_REGISTRY) {
      if (!listed.has(nb.id)) continue;
      expect(getNotebookById(nb.id)).toBeDefined();
    }
  });

  it('returns undefined for ids and paths that are not notebooks', () => {
    expect(getNotebookById('nonexistent-notebook')).toBeUndefined();
    expect(getNotebookByPath('/notebooks/does-not-exist')).toBeUndefined();
  });
});
