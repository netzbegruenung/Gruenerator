/**
 * Unit tests for `toLoggableDbError` — the redaction the DB-error logging
 * security fix rests on. It must project only `{ code, message }` and drop
 * every other enumerable property a pg `DatabaseError` carries (notably
 * `detail`, which embeds the offending bound value on constraint violations).
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect } from 'vitest';

import { toLoggableDbError } from './queries.js';

describe('toLoggableDbError', () => {
  it('keeps only code and message from a pg-style DatabaseError', () => {
    // Shape mirrors pg's DatabaseError: bound value lives in `detail`.
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Key (share_token)=(secret-abc123) already exists.',
      table: 'shared_media',
      constraint: 'shared_media_share_token_key',
      where: 'PL/pgSQL function ...',
    });

    const result = toLoggableDbError(pgError);

    expect(result).toEqual({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });
    // The sensitive fields must not survive.
    expect(result).not.toHaveProperty('detail');
    expect(JSON.stringify(result)).not.toContain('secret-abc123');
  });

  it('omits code when the error has none', () => {
    const result = toLoggableDbError(new Error('plain failure'));
    expect(result).toEqual({ message: 'plain failure' });
    expect(result).not.toHaveProperty('code');
  });

  it('handles non-Error throwables without throwing', () => {
    expect(toLoggableDbError('boom')).toEqual({ message: 'boom' });
    expect(toLoggableDbError(null)).toEqual({ message: 'null' });
    expect(toLoggableDbError(undefined)).toEqual({ message: 'undefined' });
  });
});
