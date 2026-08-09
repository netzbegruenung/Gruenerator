/**
 * Unit tests for `assertSafeSqlIdentifier` — the fail-closed structural guard
 * that keeps unsafe table/column names out of the raw-identifier interpolation
 * in the query builders, independently of the schema whitelist.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect } from 'vitest';

import { assertSafeSqlIdentifier } from './schema.js';

describe('assertSafeSqlIdentifier', () => {
  it('accepts valid snake_case identifiers', () => {
    for (const name of [
      'profiles',
      'user_documents',
      'group_content_shares',
      '_leading_underscore',
      'Mixed_Case_1',
      'a',
    ]) {
      expect(() => assertSafeSqlIdentifier(name)).not.toThrow();
    }
  });

  it('rejects identifiers with injection metacharacters', () => {
    for (const name of [
      'users; DROP TABLE users',
      'users--',
      "users' OR '1'='1",
      'a b', // whitespace
      'public.profiles', // dotted / schema-qualified
      '"quoted"',
      'col)',
      'col,other',
      'tab\tname',
    ]) {
      expect(() => assertSafeSqlIdentifier(name)).toThrow(/Invalid (table|column) identifier/);
    }
  });

  it('rejects identifiers with a leading digit', () => {
    expect(() => assertSafeSqlIdentifier('1table')).toThrow(/Invalid table identifier/);
  });

  it('rejects the empty string', () => {
    expect(() => assertSafeSqlIdentifier('')).toThrow(/Invalid table identifier/);
  });

  it('rejects non-string input', () => {
    // The guard runs on values that TS types as string but may arrive untyped
    // through the generic query builders, so runtime non-strings must throw too.
    expect(() => assertSafeSqlIdentifier(null as unknown as string)).toThrow();
    expect(() => assertSafeSqlIdentifier(undefined as unknown as string)).toThrow();
    expect(() => assertSafeSqlIdentifier(123 as unknown as string)).toThrow();
  });

  it('labels the identifier kind in the error message', () => {
    expect(() => assertSafeSqlIdentifier('bad name', 'column')).toThrow(
      /Invalid column identifier/
    );
    expect(() => assertSafeSqlIdentifier('bad name', 'table')).toThrow(/Invalid table identifier/);
  });
});
