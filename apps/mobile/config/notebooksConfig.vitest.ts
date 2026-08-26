import { NOTEBOOK_REGISTRY, isNotebookOfferedIn } from '@gruenerator/shared/notebooks';
import { describe, expect, it } from 'vitest';

import { CURRENT_INSTANCE } from './instance';
import {
  getMobileNotebooksByCategory,
  getNotebookConfig,
  getNotebookConfigByNotebookId,
  getResearchCollectionIds,
  getVisibleNotebooks,
  HIDDEN_NOTEBOOK_IDS,
  MOBILE_SYSTEM_NOTEBOOKS,
} from './notebooksConfig';

/**
 * The per-notebook maps are already drift-proofed by `satisfies Record<NotebookId, …>`
 * at compile time, so nothing here re-checks key coverage. What is NOT type-checked
 * is the derivation on top of it: the dev/disabled filter, the AT/DE audience split
 * and the id→config fallbacks. Those are what these tests pin.
 */

describe('MOBILE_SYSTEM_NOTEBOOKS', () => {
  it('excludes notebooks this instance does not offer', () => {
    const excluded = NOTEBOOK_REGISTRY.filter(
      (nb) => !isNotebookOfferedIn(nb.id, CURRENT_INSTANCE)
    );
    const ids = MOBILE_SYSTEM_NOTEBOOKS.map((nb) => nb.id);

    excluded.forEach((nb) => expect(ids).not.toContain(nb.id));
    expect(ids).toHaveLength(NOTEBOOK_REGISTRY.length - excluded.length);
  });

  it('is sorted by the registry order field', () => {
    const orders = MOBILE_SYSTEM_NOTEBOOKS.map((nb) => nb.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('resolves an Ionicons name for every entry', () => {
    MOBILE_SYSTEM_NOTEBOOKS.forEach((nb) => {
      expect(nb.icon, `${nb.id} has no icon`).toBeTruthy();
    });
  });
});

describe('getVisibleNotebooks', () => {
  it.each(['de-DE', 'de-AT'] as const)('hides the curated meta-notebooks for %s', (locale) => {
    const ids = getVisibleNotebooks(locale).map((nb) => nb.id);
    HIDDEN_NOTEBOOK_IDS.forEach((hidden) => expect(ids).not.toContain(hidden));
  });

  it('shows the Austrian notebook to AT users and not to DE users', () => {
    // AT is a first-class audience, not a DE-with-toggle. The audience filter is
    // the seam that makes that true in the gallery.
    expect(getVisibleNotebooks('de-AT').map((nb) => nb.id)).toContain('oesterreich-notebook');
    expect(getVisibleNotebooks('de-DE').map((nb) => nb.id)).not.toContain('oesterreich-notebook');
  });

  it('shows notebooks marked for all audiences to both locales', () => {
    const shared = NOTEBOOK_REGISTRY.filter(
      (nb) => (nb.audience ?? 'all') === 'all' && isNotebookOfferedIn(nb.id, CURRENT_INSTANCE)
    ).filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id));

    const de = getVisibleNotebooks('de-DE').map((nb) => nb.id);
    const at = getVisibleNotebooks('de-AT').map((nb) => nb.id);

    shared.forEach((nb) => {
      expect(de, `${nb.id} missing for de-DE`).toContain(nb.id);
      expect(at, `${nb.id} missing for de-AT`).toContain(nb.id);
    });
  });

  it('never returns a notebook whose audience is the other locale', () => {
    getVisibleNotebooks('de-DE').forEach((nb) => {
      const audience = NOTEBOOK_REGISTRY.find((r) => r.id === nb.id)?.audience ?? 'all';
      expect(audience).not.toBe('de-AT');
    });
  });
});

describe('getMobileNotebooksByCategory', () => {
  it('returns a subset of the visible notebooks, all in the asked-for category', () => {
    const visible = getVisibleNotebooks('de-DE');
    const category = visible[0].category;
    const result = getMobileNotebooksByCategory(category, 'de-DE');

    expect(result.length).toBeGreaterThan(0);
    result.forEach((nb) => expect(nb.category).toBe(category));
    result.forEach((nb) => expect(visible.map((v) => v.id)).toContain(nb.id));
  });

  it('respects the locale filter', () => {
    const atOnly = getVisibleNotebooks('de-AT').find((nb) => nb.id === 'oesterreich-notebook');
    expect(atOnly).toBeDefined();

    const de = getMobileNotebooksByCategory(atOnly!.category, 'de-DE');
    expect(de.map((nb) => nb.id)).not.toContain('oesterreich-notebook');
  });
});

describe('getResearchCollectionIds', () => {
  it('maps a system notebook to its *-system collections', () => {
    expect(getResearchCollectionIds('bayern-notebook')).toEqual(['bayern-system']);
    expect(getResearchCollectionIds('gruenerator-notebook').length).toBeGreaterThan(1);
  });

  it('returns an empty array for a user notebook UUID', () => {
    // User notebooks scope research through the per-notebook contract endpoint;
    // returning a stale system collection here would search the wrong corpus.
    expect(getResearchCollectionIds('3f1b2c4d-0000-4000-a000-000000000001')).toEqual([]);
  });

  it('returns an empty array for an unknown id rather than throwing', () => {
    expect(getResearchCollectionIds('does-not-exist')).toEqual([]);
    expect(getResearchCollectionIds('')).toEqual([]);
  });

  it('maps the Austrian notebook to the Austrian collection', () => {
    expect(getResearchCollectionIds('oesterreich-notebook')).toEqual(['oesterreich-gruene-system']);
  });
});

describe('getNotebookConfigByNotebookId', () => {
  it('strips the -notebook suffix to find the config', () => {
    expect(getNotebookConfigByNotebookId('gruenerator-notebook')?.id).toBe('gruenerator');
  });

  it('returns null when no config exists, instead of the gruenerator default', () => {
    // Most Landesverband notebooks have no per-notebook copy. Falling back to
    // the gruenerator config would label the screen "Frag Grünerator" while the
    // user is inside e.g. the Bayern notebook.
    expect(getNotebookConfigByNotebookId('bayern-notebook')).toBeNull();
    expect(getNotebookConfigByNotebookId('nope')).toBeNull();
  });

  it('only strips a trailing suffix', () => {
    expect(getNotebookConfigByNotebookId('gruenerator-notebook-extra')).toBeNull();
  });
});

describe('getNotebookConfig', () => {
  it('resolves a known config id', () => {
    expect(getNotebookConfig('gruenerator').id).toBe('gruenerator');
  });

  it('falls back to the gruenerator config for an unknown id', () => {
    // Unlike getNotebookConfigByNotebookId, this one is a "give me something
    // renderable" accessor and deliberately never returns null.
    expect(getNotebookConfig('nope').id).toBe('gruenerator');
  });
});
