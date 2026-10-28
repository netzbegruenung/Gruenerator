// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { STAMP_STATE_KEY, STAMP_V2_STEP, V2_CORE_STEP } from './__fixtures__/v2Fixture.js';
import {
  CANVAS_DOCUMENT_VERSION,
  canvasDocumentSchema,
  createMigrationRegistry,
  documentMigrations,
  migrateDocument,
  stampDocument,
} from './migrations.js';

const v1 = () => ({
  pages: [
    {
      id: 'p1',
      configId: 'freeform',
      state: {
        backgroundColor: '#123456',
        stampInstances: [{ id: 's1', label: 'A', offset: { x: 1, y: 2 } }],
      },
    },
    { id: 'p2', configId: 'freeform', state: { headline: 'x' }, config: { zoom: 1 } },
  ],
  coverKey: 'kept',
});

const v2Registry = () => {
  const registry = createMigrationRegistry([V2_CORE_STEP]);
  registry.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
  return registry;
};

describe('the core at version 1', () => {
  it('ships version 1 with no steps', () => {
    expect(CANVAS_DOCUMENT_VERSION).toBe(1);
    expect(documentMigrations.coreVersion).toBe(1);
  });

  it('hands an unversioned document back as the same object', () => {
    const raw = v1();
    const before = JSON.stringify(raw);
    const result = migrateDocument(raw);
    expect(result.status).toBe('current');
    if (result.status !== 'current') return;
    expect(result.document).toBe(raw);
    expect(JSON.stringify(result.document)).toBe(before);
  });

  it('reads an explicit version 1 as current', () => {
    expect(migrateDocument({ ...v1(), schemaVersion: 1 }).status).toBe('current');
  });

  it('stamps the version on write, additively', () => {
    const stamped = stampDocument(v1());
    expect(stamped).toEqual({ ...v1(), schemaVersion: 1 });
  });
});

describe('the envelope', () => {
  it.each([
    ['a string version', { schemaVersion: '1', pages: [] }],
    ['version 0', { schemaVersion: 0, pages: [] }],
    ['a fractional version', { schemaVersion: 1.5, pages: [] }],
    ['a kind version below 1', { kindVersions: { stampInstances: 0 }, pages: [] }],
    ['pages that are no list', { pages: {} }],
    ['no object', 'pages'],
    ['null', null],
  ])('refuses %s', (_name, raw) => {
    expect(migrateDocument(raw).status).toBe('invalid');
  });

  it('passes unknown top-level keys through', () => {
    const parsed = canvasDocumentSchema.parse({ pages: [], host: { a: 1 } });
    expect(parsed).toEqual({ pages: [], host: { a: 1 } });
  });
});

describe('the registry', () => {
  it('requires contiguous core steps from 1', () => {
    expect(() => createMigrationRegistry([{ from: 2, migrate: (d) => d }])).toThrow(/from 1/);
  });

  it('requires contiguous host steps from 1', () => {
    const registry = createMigrationRegistry([]);
    expect(() => registry.registerStateKey('k', [{ from: 2, migrate: (v) => v }])).toThrow(
      /from 1/
    );
  });

  it('knows a host key registered without steps at version 1', () => {
    const registry = createMigrationRegistry([]);
    registry.registerStateKey('k', []);
    expect(registry.kindVersion('k')).toBe(1);
    expect(registry.kindVersion('other')).toBeNull();
  });
});

describe('the test-only v1 → v2 chain', () => {
  it('lifts the core and the host kind and stamps both', () => {
    const raw = v1();
    const before = JSON.stringify(raw);
    const result = migrateDocument(raw, v2Registry());
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.from).toEqual({ schemaVersion: 1, kindVersions: { stampInstances: 1 } });
    expect(result.to).toEqual({ schemaVersion: 2, kindVersions: { stampInstances: 2 } });
    expect(result.document).toEqual({
      schemaVersion: 2,
      kindVersions: { stampInstances: 2 },
      coverKey: 'kept',
      pages: [
        {
          id: 'p1',
          configId: 'freeform',
          state: {
            background: { color: '#123456' },
            stampInstances: [{ id: 's1', label: 'A', position: { x: 1, y: 2 } }],
          },
        },
        { id: 'p2', configId: 'freeform', state: { headline: 'x' }, config: { zoom: 1 } },
      ],
    });
    // The input is never mutated.
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('is idempotent: its output comes back as current', () => {
    const registry = v2Registry();
    const once = migrateDocument(v1(), registry);
    if (once.status !== 'migrated') throw new Error(once.status);
    const twice = migrateDocument(once.document, registry);
    expect(twice.status).toBe('current');
  });

  it('runs each step idempotently on already lifted data', () => {
    const registry = v2Registry();
    const once = migrateDocument(v1(), registry);
    if (once.status !== 'migrated') throw new Error(once.status);
    // Lifted pages without a stamp (a server seed that copied pages only).
    const { schemaVersion: _s, kindVersions: _k, ...unstamped } = once.document;
    const again = migrateDocument(unstamped, registry);
    if (again.status !== 'migrated') throw new Error(again.status);
    expect(again.document).toEqual(once.document);
  });

  it('is deterministic', () => {
    const a = migrateDocument(v1(), v2Registry());
    const b = migrateDocument(v1(), v2Registry());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('runs only the host step when the core is already current', () => {
    const registry = createMigrationRegistry([]);
    registry.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
    const result = migrateDocument(v1(), registry);
    if (result.status !== 'migrated') throw new Error(result.status);
    expect(result.document.schemaVersion).toBeUndefined();
    expect(result.document.kindVersions).toEqual({ stampInstances: 2 });
    expect(result.document.pages?.[1]).toEqual(v1().pages[1]);
  });

  it('stamps both versions on write', () => {
    expect(stampDocument({ pages: [] }, v2Registry())).toEqual({
      pages: [],
      schemaVersion: 2,
      kindVersions: { stampInstances: 2 },
    });
  });
});

describe('a document from a newer version', () => {
  it('is refused, untouched, for the core', () => {
    const raw = { ...v1(), schemaVersion: 2 };
    const result = migrateDocument(raw);
    expect(result).toEqual({
      status: 'newer',
      scope: null,
      version: 2,
      known: 1,
      document: raw,
    });
  });

  it('is refused for a host kind this build knows', () => {
    const registry = createMigrationRegistry([]);
    registry.registerStateKey(STAMP_STATE_KEY, []);
    const result = migrateDocument({ ...v1(), kindVersions: { stampInstances: 2 } }, registry);
    expect(result).toMatchObject({ status: 'newer', scope: STAMP_STATE_KEY, version: 2, known: 1 });
  });

  it('is accepted for a host kind this build does not know (opaque data)', () => {
    const raw = { ...v1(), kindVersions: { otherInstances: 7 } };
    expect(migrateDocument(raw).status).toBe('current');
  });

  it('is refused for v2 by a v1 build after a v2 build wrote it', () => {
    const lifted = migrateDocument(v1(), v2Registry());
    if (lifted.status !== 'migrated') throw new Error(lifted.status);
    expect(migrateDocument(lifted.document).status).toBe('newer');
  });
});
