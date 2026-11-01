// SPDX-License-Identifier: MPL-2.0
/**
 * The upgrade test: real-shaped version-1 documents, as stored before
 * versioning existed (no version field), load through `migrateDocument`
 * unchanged — the same object, the same bytes — and the test-only v1 → v2
 * chain lifts every one of them deterministically and idempotently.
 */
import { describe, expect, it } from 'vitest';

import everyCoreKind from './__fixtures__/v1/everyCoreKind.json';
import flatSinglePage from './__fixtures__/v1/flatSinglePage.json';
import hostEnvelope from './__fixtures__/v1/hostEnvelope.json';
import multiPageDeck from './__fixtures__/v1/multiPageDeck.json';
import { STAMP_STATE_KEY, STAMP_V2_STEP, V2_CORE_STEP } from './__fixtures__/v2Fixture.js';
import { createMigrationRegistry, migrateDocument, stampDocument } from './migrations.js';

const CORPUS: Record<string, unknown> = {
  everyCoreKind,
  flatSinglePage,
  hostEnvelope,
  multiPageDeck,
};

/** A fresh copy, as a load reads it from storage. */
const load = (name: string): unknown => JSON.parse(JSON.stringify(CORPUS[name]));

const v2Registry = () => {
  const registry = createMigrationRegistry([V2_CORE_STEP]);
  registry.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
  return registry;
};

const v1Registry = () => {
  const registry = createMigrationRegistry([]);
  registry.registerStateKey(STAMP_STATE_KEY, []);
  return registry;
};

const names = Object.keys(CORPUS);

describe('v1 corpus under the v1 core', () => {
  it.each(names)('%s round-trips byte-identically', (name) => {
    const stored = JSON.stringify(CORPUS[name]);
    const raw = load(name);
    const result = migrateDocument(raw, v1Registry());
    expect(result.status).toBe('current');
    if (result.status !== 'current') return;
    expect(result.document).toBe(raw);
    expect(JSON.stringify(result.document)).toBe(stored);
  });

  it.each(names)('%s gains only the version field when written', (name) => {
    const stamped = stampDocument(load(name) as object, v1Registry());
    const { schemaVersion, ...rest } = stamped;
    expect(schemaVersion).toBe(1);
    expect(JSON.stringify(rest)).toBe(JSON.stringify(CORPUS[name]));
  });
});

describe('v1 corpus through the test-only v1 → v2 chain', () => {
  it.each(names)('%s lifts deterministically', (name) => {
    const a = migrateDocument(load(name), v2Registry());
    const b = migrateDocument(load(name), v2Registry());
    expect(a.status).toBe('migrated');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toMatchSnapshot();
  });

  it.each(names)('%s is idempotent: the lifted document is current', (name) => {
    const once = migrateDocument(load(name), v2Registry());
    if (once.status !== 'migrated') throw new Error(once.status);
    const twice = migrateDocument(once.document, v2Registry());
    expect(twice.status).toBe('current');
  });

  it.each(names)('%s keeps its pages and every key the steps do not own', (name) => {
    const once = migrateDocument(load(name), v2Registry());
    if (once.status !== 'migrated') throw new Error(once.status);
    const before = CORPUS[name] as { pages?: { id: string; state: Record<string, unknown> }[] };
    const after = once.document.pages as { id: string; state: Record<string, unknown> }[] | null;
    expect(after?.map((p) => p.id) ?? null).toEqual(before.pages?.map((p) => p.id) ?? null);
    for (const [i, page] of (before.pages ?? []).entries()) {
      const owned = new Set(['backgroundColor', 'background', STAMP_STATE_KEY]);
      const keep = (state: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(state).filter(([key]) => !owned.has(key)));
      expect(keep(after![i]!.state)).toEqual(keep(page.state));
    }
  });

  it.each(names)('%s, once lifted, is refused by a v1 build', (name) => {
    const once = migrateDocument(load(name), v2Registry());
    if (once.status !== 'migrated') throw new Error(once.status);
    expect(migrateDocument(once.document, v1Registry()).status).toBe('newer');
  });
});
