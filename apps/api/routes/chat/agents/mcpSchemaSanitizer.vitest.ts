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

  // Melious `:balanced` answers each of these with 400 „malformed" for the whole
  // request (measured 03.10.2026, one tool per request); `:speed` took them all.
  describe('rewrites what the JSON-Schema meta-schema rejects', () => {
    const prop = (a: Record<string, unknown>) =>
      (
        sanitizeMcpSchema({ type: 'object', properties: { a } }).properties as Record<
          string,
          unknown
        >
      ).a;

    it('moves a draft-04 boolean exclusive bound onto the number', () => {
      expect(prop({ type: 'number', exclusiveMinimum: true, minimum: 0 })).toEqual({
        type: 'number',
        exclusiveMinimum: 0,
      });
      expect(prop({ type: 'number', exclusiveMaximum: true, maximum: 5 })).toEqual({
        type: 'number',
        exclusiveMaximum: 5,
      });
      expect(prop({ type: 'number', exclusiveMinimum: false, minimum: 0 })).toEqual({
        type: 'number',
        minimum: 0,
      });
      expect(prop({ type: 'number', exclusiveMinimum: true })).toEqual({ type: 'number' });
      expect(prop({ type: 'number', exclusiveMinimum: 3 })).toEqual({
        type: 'number',
        exclusiveMinimum: 3,
      });
    });

    it('turns numbers sent as strings into numbers and drops invalid counts', () => {
      expect(prop({ type: 'number', minimum: '0' })).toEqual({ type: 'number', minimum: 0 });
      expect(prop({ type: 'array', minItems: '1' })).toEqual({ type: 'array', minItems: 1 });
      expect(prop({ type: 'string', maxLength: 1.5 })).toEqual({ type: 'string' });
      expect(prop({ type: 'string', minLength: 'abc' })).toEqual({ type: 'string' });
      expect(prop({ type: 'number', multipleOf: 0 })).toEqual({ type: 'number' });
    });

    it('drops type names JSON Schema does not know', () => {
      expect(prop({ type: 'file' })).toEqual({});
      expect(prop({ type: ['string', 'file'] })).toEqual({ type: ['string'] });
    });

    it('drops tuple items and a boolean required on a property', () => {
      expect(prop({ type: 'array', items: [{ type: 'string' }] })).toEqual({ type: 'array' });
      expect(prop({ type: 'string', required: true })).toEqual({ type: 'string' });
    });

    it('reaches every subschema position, not only properties/items/combiners', () => {
      const bad = { type: 'number', exclusiveMinimum: true, minimum: 1 };
      const good = { type: 'number', exclusiveMinimum: 1 };
      expect(prop({ type: 'object', patternProperties: { '^x': bad } })).toEqual({
        type: 'object',
        patternProperties: { '^x': good },
      });
      expect(prop({ not: bad, prefixItems: [bad] })).toEqual({ not: good, prefixItems: [good] });
    });

    it('does not pass a node below the depth limit through unchecked', () => {
      let node: Record<string, unknown> = { type: 'number', exclusiveMinimum: true, minimum: 0 };
      for (let i = 0; i < 20; i++) node = { type: 'object', properties: { x: node } };
      expect(JSON.stringify(sanitizeMcpSchema(node))).not.toContain('true');
    });
  });
});
