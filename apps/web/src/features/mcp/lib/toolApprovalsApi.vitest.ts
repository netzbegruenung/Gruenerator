import { describe, expect, it } from 'vitest';

import { toolNameFromScopeKey } from './toolApprovalsApi';

describe('toolNameFromScopeKey', () => {
  it('names the internal table tool in plain German', () => {
    expect(toolNameFromScopeKey('internal/tabelle_auswerten')).toBe(
      'Tabellen auswerten (Python im Browser)'
    );
  });

  it('keeps the bare tool name for connector scopes', () => {
    expect(toolNameFromScopeKey('mcp:abc/create_form')).toBe('create_form');
  });
});
