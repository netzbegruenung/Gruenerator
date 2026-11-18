import { describe, it, expect } from 'vitest';

import { formatNamespacedToolLabel } from '../../lib/toolMappings';

describe('formatNamespacedToolLabel', () => {
  it('strips the MCP namespace and prepends the server name', () => {
    expect(formatNamespacedToolLabel('s0__search', 'Notion')).toBe('Notion · search');
    expect(formatNamespacedToolLabel('s12__create_page', 'Brevo')).toBe('Brevo · create_page');
  });

  it('passes internal tool names through unchanged', () => {
    expect(formatNamespacedToolLabel('gruenerator_search')).toBe('gruenerator_search');
  });

  it('handles a namespaced name without a server label', () => {
    expect(formatNamespacedToolLabel('s3__lookup')).toBe('lookup');
  });
});
