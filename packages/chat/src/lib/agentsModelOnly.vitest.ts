import { describe, expect, it } from 'vitest';

import { agentsList, listedAgentsList } from './agents';

describe('model-only recipes', () => {
  it('stay out of the @-menu and library lists', () => {
    expect(agentsList.map((a) => a.mention)).not.toContain('visuelle-bausteine');
    expect(listedAgentsList.map((a) => a.mention)).not.toContain('visuelle-bausteine');
  });
});
