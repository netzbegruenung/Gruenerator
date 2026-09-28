import { createUserAgentBodySchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { isUserAgentId } from './userAgentHandle.js';

/**
 * A handle is either a row uuid or a per-owner identifier. The identifier
 * regex (`^[a-z0-9-]+$`) admits a lowercase uuid, so the uuid check has to be
 * exact: anything else must stay an identifier, and a non-uuid must never
 * reach a uuid column (Postgres rejects the cast with a 500).
 */
describe('isUserAgentId', () => {
  it.each(['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-22222222ABCD'])(
    'treats %s as an id',
    (handle) => {
      expect(isUserAgentId(handle)).toBe(true);
    }
  );

  it.each([
    'klima-gruenerator',
    'presse-ab3xk9',
    '22222222222242228222222222222222',
    '22222222-2222-4222-8222-222222222222-kopie',
    '',
  ])('treats %j as an identifier', (handle) => {
    expect(isUserAgentId(handle)).toBe(false);
  });
});

/** Without this a new agent could be created whose identifier reads as someone's uuid. */
describe('createUserAgentBodySchema identifier', () => {
  const identifierError = (identifier: string) =>
    createUserAgentBodySchema
      .safeParse({ identifier })
      .error?.issues.find((i) => i.path[0] === 'identifier');

  it('rejects a uuid-shaped identifier', () => {
    expect(identifierError('22222222-2222-4222-8222-222222222222')).toBeDefined();
  });

  it('accepts a slug with suffix', () => {
    expect(identifierError('gruene-poesie-ab3xk9')).toBeUndefined();
  });
});
