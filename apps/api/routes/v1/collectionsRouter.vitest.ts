import { describe, expect, it } from 'vitest';

import { serializeMcpCatalog } from './collectionsRouter.js';

describe('serializeMcpCatalog', () => {
  const catalog = serializeMcpCatalog();
  const byKey = Object.fromEntries(catalog.map((c) => [c.key, c]));

  it('serves only mcpExposed collections (abgeordnetenwatch in, ricarda out)', () => {
    const keys = catalog.map((c) => c.key);
    expect(keys).toContain('abgeordnetenwatch');
    expect(keys).toContain('deutschland');
    expect(keys).not.toContain('ricarda-lang-tweets');
  });

  it('exposes displayName (from name) and omits backend-only tuning fields', () => {
    const bayern = byKey.bayern as Record<string, unknown>;
    expect(bayern.displayName).toBe('Grüne Bayern');
    expect(bayern).not.toHaveProperty('id');
    expect(bayern).not.toHaveProperty('minQuality');
    expect(bayern).not.toHaveProperty('recallLimit');
    expect(bayern).not.toHaveProperty('mcpExposed');
    expect(bayern).not.toHaveProperty('name');
  });

  it('strips mcpHidden facets (themes/persons) from serialized filterableFields', () => {
    const fields = byKey.bayern.filterableFields.map((f) => f.field);
    expect(fields).not.toContain('themes');
    expect(fields).not.toContain('persons');
    expect(fields).toContain('content_type');
  });

  it('preserves the reconciled bayern default filter', () => {
    expect(byKey.bayern.defaultFilter).toEqual({
      field: 'landesverband',
      value: ['BY', 'BY-F'],
    });
  });
});
