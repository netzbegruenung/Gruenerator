import { describe, expect, it } from 'vitest';

import { connectorStatusOf } from './mentionableSync';

const base = { id: 's', name: 'Server', enabled: true };

describe('connectorStatusOf', () => {
  it('is null for a working server', () => {
    expect(connectorStatusOf({ ...base, authType: 'oauth', hasToken: true })).toBeNull();
  });

  it('asks for approval when tools changed under the person', () => {
    expect(
      connectorStatusOf({ ...base, toolsDrift: { changed: ['create_form'], added: [] } })
    ).toBe('needs_approval');
  });

  it('only added tools do not block the server', () => {
    expect(connectorStatusOf({ ...base, toolsDrift: { changed: [], added: ['x'] } })).toBeNull();
  });

  it('asks for a login when an OAuth server has no token', () => {
    expect(connectorStatusOf({ ...base, authType: 'oauth', hasToken: false })).toBe('needs_login');
  });

  it('ignores a missing token on a known connector, whose credentials come from the env', () => {
    expect(
      connectorStatusOf({ ...base, authType: 'oauth', hasToken: false, managed: true })
    ).toBeNull();
  });
});
