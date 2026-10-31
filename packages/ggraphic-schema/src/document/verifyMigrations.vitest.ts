// SPDX-License-Identifier: MPL-2.0
/**
 * Idempotence per step is a requirement, not a hope: every registered step
 * must pass `verifyMigrationRegistry` over the v1 corpus. This file holds the
 * helper to that, red probes included, and runs it on the core's own registry.
 */
import { describe, expect, it } from 'vitest';

import everyCoreKind from './__fixtures__/v1/everyCoreKind.json';
import flatSinglePage from './__fixtures__/v1/flatSinglePage.json';
import hostEnvelope from './__fixtures__/v1/hostEnvelope.json';
import multiPageDeck from './__fixtures__/v1/multiPageDeck.json';
import { STAMP_STATE_KEY, STAMP_V2_STEP, V2_CORE_STEP } from './__fixtures__/v2Fixture.js';
import { createMigrationRegistry, documentMigrations, mapPages } from './migrations.js';
import { verifyMigrationRegistry } from './verifyMigrations.js';

const corpus = (): unknown[] =>
  JSON.parse(JSON.stringify([everyCoreKind, flatSinglePage, hostEnvelope, multiPageDeck]));

describe('verifyMigrationRegistry', () => {
  it('passes the core registry over the v1 corpus', () => {
    expect(verifyMigrationRegistry(documentMigrations, corpus())).toEqual([]);
  });

  it('passes the test-only v2 steps', () => {
    const registry = createMigrationRegistry([V2_CORE_STEP]);
    registry.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
    expect(verifyMigrationRegistry(registry, corpus())).toEqual([]);
  });

  it('fails a core step that lifts twice', () => {
    const counts = createMigrationRegistry([
      {
        from: 1,
        migrate: (doc) =>
          mapPages(doc, (page) => ({
            ...page,
            state: { ...page.state, lifts: ((page.state['lifts'] as number) ?? 0) + 1 },
          })),
      },
    ]);
    expect(verifyMigrationRegistry(counts, corpus()).join('\n')).toMatch(
      /core step 1→2 is not idempotent/
    );
  });

  it('fails a host step that is not a no-op on its own output', () => {
    const registry = createMigrationRegistry([]);
    registry.registerStateKey(STAMP_STATE_KEY, [
      { from: 1, migrate: (list) => (Array.isArray(list) ? [...list, { id: 'extra' }] : list) },
    ]);
    expect(verifyMigrationRegistry(registry, corpus()).join('\n')).toMatch(
      /"stampInstances" step 1→2 is not idempotent/
    );
  });

  it('fails a step that mutates its input', () => {
    const registry = createMigrationRegistry([
      {
        from: 1,
        migrate: (doc) => {
          (doc as Record<string, unknown>)['touched'] = true;
          return doc;
        },
      },
    ]);
    expect(verifyMigrationRegistry(registry, corpus()).join('\n')).toMatch(/mutates its input/);
  });

  it('fails a step that is not deterministic', () => {
    let n = 0;
    const registry = createMigrationRegistry([
      { from: 1, migrate: (doc) => ({ ...doc, run: (n += 1) % 2 }) },
    ]);
    expect(verifyMigrationRegistry(registry, corpus()).join('\n')).toMatch(/not deterministic/);
  });
});
