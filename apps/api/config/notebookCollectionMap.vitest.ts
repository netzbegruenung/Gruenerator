/**
 * The backend half of the instance content policy (AP4 in
 * `docs/instanz-filterung-plan.md`).
 *
 * Qdrant is NOT partitioned per instance — there is one `QDRANT_URL` — so a
 * notebook hidden in the frontend registry alone would stay fully searchable and
 * the chat would keep citing its sources to a user who cannot see it. These
 * tests are the regression guard for exactly that, and for the line between the
 * two tiers:
 *
 *   hidden  — gone from discovery and from implicit search, direct link resolves
 *   blocked — not reachable at all
 *
 * The tiers are exercised through `createNotebookGate(view)` with a synthetic
 * policy view — the same code path production takes, and the only way to cover
 * `block`, which no registered instance uses. The registered bgst selection is
 * asserted separately at the bottom, so the mechanism and the deployment that
 * relies on it are both guarded.
 */
import { INSTANCES, getInstance, type InstancePolicyView } from '@gruenerator/shared/instances';
import {
  NOTEBOOK_REGISTRY,
  isNotebookOfferedIn,
  isNotebookResolvableIn,
} from '@gruenerator/shared/notebooks';
import { describe, expect, it } from 'vitest';

import { CURRENT_INSTANCE } from './instance.js';
import {
  NOTEBOOK_COLLECTION_MAP,
  createNotebookGate,
  isNotebookImplicitlySearchable,
  isNotebookResolvable,
} from './notebookCollectionMap.js';

/** An instance that curates away the Landesverbände — this is the bgst case. */
const HIDES_LANDESEBENE: InstancePolicyView = {
  channels: ['stable'],
  hide: { notebookCategories: ['landesebene'] },
};

/** The same selection expressed as a hard block. */
const BLOCKS_LANDESEBENE: InstancePolicyView = {
  channels: ['stable'],
  block: { notebookCategories: ['landesebene'] },
};

const PLAIN: InstancePolicyView = { channels: ['stable'] };

// `berlin-notebook` is `category: 'landesebene'` and maps to the `berlin`
// collection — the notebook the plan uses to describe the leak.
const HIDDEN_ID = 'berlin-notebook';
const HIDDEN_COLLECTION = 'berlin';

describe('notebook gate — hidden tier', () => {
  const gate = createNotebookGate(HIDES_LANDESEBENE);

  it('keeps a hidden notebook out of implicit search', () => {
    expect(gate.isImplicitlySearchable(HIDDEN_ID)).toBe(false);
  });

  it('still resolves a hidden notebook — a shared link must not die', () => {
    expect(gate.isResolvable(HIDDEN_ID)).toBe(true);
  });

  it('leaves search inside the opened notebook intact', () => {
    // Test 1 of the plan: resolving to an empty page is worse than a 404, so an
    // explicit scope on the hidden notebook must still produce its collections.
    expect(NOTEBOOK_COLLECTION_MAP[HIDDEN_ID]).toContain(HIDDEN_COLLECTION);
    expect(gate.isResolvable(HIDDEN_ID)).toBe(true);
  });

  it('does not gate notebooks of other categories', () => {
    expect(gate.isImplicitlySearchable('gruenerator-notebook')).toBe(true);
    expect(gate.isImplicitlySearchable('kommunalwiki-notebook')).toBe(true);
  });
});

describe('notebook gate — the citation path', () => {
  const gate = createNotebookGate(HIDES_LANDESEBENE);

  it('drops the hidden collection from search-everything', () => {
    // Test 2: the turn never named the notebook, so none of its Qdrant sources
    // may reach the answer. This is the check that stays red when the frontend
    // hides a notebook and the backend keeps searching it.
    //
    // Asserted against the unrestricted instance too, so the test cannot pass by
    // the list coming out empty.
    expect(createNotebookGate(PLAIN).implicitSearchCollectionIds()).toContain(HIDDEN_COLLECTION);
    expect(gate.implicitSearchCollectionIds()).not.toContain(HIDDEN_COLLECTION);
  });

  it('drops it from any implicit collection list', () => {
    expect(gate.dropHiddenCollections(['deutschland', HIDDEN_COLLECTION])).toEqual(['deutschland']);
  });

  it('keeps collections a hidden notebook merely shares', () => {
    // `deutschland` is reachable through `gruenerator-notebook` too, so hiding
    // one claimant must not take the collection away from the others.
    expect(gate.implicitSearchCollectionIds()).toContain('deutschland');
  });

  it('never touches collections no registry notebook claims', () => {
    // Agent territory (`gruene-at` backs the AT locale defaults,
    // `ricarda-lang-tweets` a single specialized agent). The instance policy is
    // written in notebooks and says nothing about these — a denylist derived
    // from notebooks must therefore leave them alone.
    expect(gate.dropHiddenCollections(['gruene-at', 'ricarda-lang-tweets'])).toEqual([
      'gruene-at',
      'ricarda-lang-tweets',
    ]);
  });

  it('leaves the whole list alone when the instance hides nothing', () => {
    const plain = createNotebookGate(PLAIN);
    const collections = ['deutschland', HIDDEN_COLLECTION, 'kommunalwiki'];
    expect(plain.dropHiddenCollections(collections)).toEqual(collections);
  });
});

describe('notebook gate — blocked tier', () => {
  const gate = createNotebookGate(BLOCKS_LANDESEBENE);

  it('does not resolve a blocked notebook, not even by direct link', () => {
    // Test 3 — the difference that makes two tiers worth having.
    expect(gate.isResolvable(HIDDEN_ID)).toBe(false);
    expect(gate.isImplicitlySearchable(HIDDEN_ID)).toBe(false);
  });
});

describe('notebook gate — same source as the frontend', () => {
  // Test 4: one test holding both sides against each other, rather than two
  // tests that each assert their own side and drift apart.
  const instanceIds = INSTANCES.map((i) => i.id);

  it('agrees with the shared predicates for every instance and notebook', () => {
    for (const instanceId of instanceIds) {
      const gate = createNotebookGate(getInstance(instanceId));
      for (const nb of NOTEBOOK_REGISTRY) {
        const mapped = nb.id in NOTEBOOK_COLLECTION_MAP;
        expect({ instanceId, id: nb.id, searchable: gate.isImplicitlySearchable(nb.id) }).toEqual({
          instanceId,
          id: nb.id,
          searchable: mapped && isNotebookOfferedIn(nb.id, instanceId),
        });
        expect({ instanceId, id: nb.id, resolvable: gate.isResolvable(nb.id) }).toEqual({
          instanceId,
          id: nb.id,
          resolvable: mapped && isNotebookResolvableIn(nb.id, instanceId),
        });
      }
    }
  });

  it('never lets implicit search reach further than resolution', () => {
    for (const view of [PLAIN, HIDES_LANDESEBENE, BLOCKS_LANDESEBENE]) {
      const gate = createNotebookGate(view);
      for (const nb of NOTEBOOK_REGISTRY) {
        if (gate.isImplicitlySearchable(nb.id)) expect(gate.isResolvable(nb.id)).toBe(true);
      }
    }
  });
});

describe('notebook gate — bound to this process', () => {
  it('behaves like the registered instance the API resolved', () => {
    // The exported helpers are what ChatGraph and streamContext call; this keeps
    // them from drifting away from the factory the tests above exercise.
    for (const nb of NOTEBOOK_REGISTRY) {
      const mapped = nb.id in NOTEBOOK_COLLECTION_MAP;
      expect(isNotebookResolvable(nb.id)).toBe(
        mapped && isNotebookResolvableIn(nb.id, CURRENT_INSTANCE)
      );
      expect(isNotebookImplicitlySearchable(nb.id)).toBe(
        mapped && isNotebookOfferedIn(nb.id, CURRENT_INSTANCE)
      );
    }
  });

  it('treats unknown ids as unroutable rather than gating them', () => {
    expect(isNotebookResolvable('nonexistent-notebook')).toBe(false);
    expect(isNotebookResolvable('')).toBe(false);
    // A collection key is not a notebook id.
    expect(isNotebookImplicitlySearchable('deutschland')).toBe(false);
  });
});

describe('notebook gate — the registered bgst instance', () => {
  const gate = createNotebookGate(getInstance('bgst'));

  // Nicht über eine Id-Liste: ein dreizehnter Landesverband erbt die Regel,
  // ohne dass jemand diese Datei anfasst.
  it('drops every Landesverband and Austrian collection from implicit search', () => {
    const searchable = new Set(gate.implicitSearchCollectionIds());
    for (const nb of NOTEBOOK_REGISTRY) {
      if (nb.category !== 'landesebene' && nb.category !== 'oesterreich') continue;
      const collection = NOTEBOOK_COLLECTION_MAP[nb.id];
      if (!collection) continue;
      expect(searchable, `${nb.id} → ${collection}`).not.toContain(collection);
    }
  });

  it('keeps the Bundesverband notebook it is the only instance to offer', () => {
    expect(gate.isImplicitlySearchable('gruene-notebook')).toBe(true);
  });

  // hide, nicht block: ein von anderswo geteilter Link darf nicht 404en.
  it('still resolves a hidden Landesverband notebook by direct link', () => {
    expect(gate.isResolvable('berlin-notebook')).toBe(true);
    expect(gate.isImplicitlySearchable('berlin-notebook')).toBe(false);
  });
});
