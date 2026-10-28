// SPDX-License-Identifier: MPL-2.0
import { documentMigrations, migrateDocument } from '@ggraphic/schema';
import { STAMP_V2_STEP } from '@ggraphic/schema/document/__fixtures__/v2Fixture';
import { afterEach, describe, expect, it } from 'vitest';

import { STAMP_KIND } from '../testing/stampKind.js';

import { registerElementKind, type ElementKindRegistration } from './elementKinds.js';

const register = (migrations?: ElementKindRegistration['migrations']) =>
  registerElementKind({
    ...(STAMP_KIND as unknown as ElementKindRegistration<never>),
    ...(migrations ? { migrations } : {}),
  });

// The registry is module-wide: leave it as the next test file expects it.
afterEach(() => documentMigrations.unregisterStateKey('stampInstances'));

describe('a host kind registers its document migrations', () => {
  it('at version 1 without steps, so a newer list is refused', () => {
    register();
    expect(documentMigrations.kindVersion('stampInstances')).toBe(1);
    const raw = { kindVersions: { stampInstances: 2 }, pages: [] };
    expect(migrateDocument(raw).status).toBe('newer');
  });

  it('with its steps, lifting its own list on load', () => {
    register([STAMP_V2_STEP]);
    expect(documentMigrations.kindVersion('stampInstances')).toBe(2);
    const result = migrateDocument({
      pages: [{ configId: 'c', state: { stampInstances: [{ id: 's', offset: { x: 1, y: 1 } }] } }],
    });
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.document).toEqual({
      kindVersions: { stampInstances: 2 },
      pages: [
        { configId: 'c', state: { stampInstances: [{ id: 's', position: { x: 1, y: 1 } }] } },
      ],
    });
  });
});
