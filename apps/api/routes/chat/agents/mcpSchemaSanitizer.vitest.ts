import { describe, it, expect } from 'vitest';

import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';

describe('sanitizeMcpSchema', () => {
  it('guarantees an object root with a properties map', () => {
    expect(sanitizeMcpSchema(undefined)).toEqual({ type: 'object', properties: {} });
    expect(sanitizeMcpSchema(null)).toEqual({ type: 'object', properties: {} });
    expect(sanitizeMcpSchema({ type: 'string' })).toMatchObject({ type: 'object', properties: {} });
  });

  it('drops meta keywords ($schema/$id/$defs/definitions)', () => {
    const out = sanitizeMcpSchema({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'x',
      $defs: { Foo: { type: 'string' } },
      definitions: { Bar: { type: 'number' } },
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect(out).not.toHaveProperty('$schema');
    expect(out).not.toHaveProperty('$id');
    expect(out).not.toHaveProperty('$defs');
    expect(out).not.toHaveProperty('definitions');
    expect(out.properties).toHaveProperty('a');
  });

  it('replaces $ref nodes with a permissive {} but keeps the property', () => {
    const out = sanitizeMcpSchema({
      type: 'object',
      properties: {
        page: { $ref: '#/$defs/Page' },
        title: { type: 'string' },
      },
    }) as { properties: Record<string, unknown> };
    expect(out.properties.page).toEqual({});
    expect(out.properties.title).toEqual({ type: 'string' });
  });

  it('recurses into items and anyOf/oneOf/allOf combiners', () => {
    const out = sanitizeMcpSchema({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { $ref: '#/$defs/Tag' } },
        mode: { anyOf: [{ $ref: '#/$defs/A' }, { type: 'string' }] },
      },
    }) as { properties: { tags: { items: unknown }; mode: { anyOf: unknown[] } } };
    expect(out.properties.tags.items).toEqual({});
    expect(out.properties.mode.anyOf[0]).toEqual({});
    expect(out.properties.mode.anyOf[1]).toEqual({ type: 'string' });
  });

  it('preserves ordinary constraints (required, enum, description)', () => {
    const out = sanitizeMcpSchema({
      type: 'object',
      required: ['q'],
      properties: { q: { type: 'string', description: 'query', enum: ['a', 'b'] } },
    }) as { required: string[]; properties: { q: Record<string, unknown> } };
    expect(out.required).toEqual(['q']);
    expect(out.properties.q).toMatchObject({
      type: 'string',
      description: 'query',
      enum: ['a', 'b'],
    });
  });
});
