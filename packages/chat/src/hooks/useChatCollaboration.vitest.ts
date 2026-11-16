import { describe, expect, it } from 'vitest';

import { appendDevBypassUser } from './useChatCollaboration';

describe('appendDevBypassUser', () => {
  it('puts the dev identity in the URL query (the v4 provider has no `parameters` option)', () => {
    expect(appendDevBypassUser('ws://localhost:3000/ws', 'abc')).toBe(
      'ws://localhost:3000/ws/?dev_auth_user=abc'
    );
  });

  it('keeps a trailing slash single, so the /ws proxy rewrite yields "/?…"', () => {
    expect(appendDevBypassUser('ws://localhost:3000/ws/', 'abc')).toBe(
      'ws://localhost:3000/ws/?dev_auth_user=abc'
    );
  });

  it('leaves the URL alone without an identity', () => {
    expect(appendDevBypassUser('ws://h/ws', null)).toBe('ws://h/ws');
  });
});
