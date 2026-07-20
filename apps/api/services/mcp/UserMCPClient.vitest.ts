import { describe, it, expect } from 'vitest';

import { UserMCPClient } from './UserMCPClient.js';

// The server URL is user-provided (custom MCP servers), so connect() must refuse
// internal/metadata targets before opening a transport (SSRF guard).
describe('UserMCPClient SSRF guard', () => {
  it('refuses localhost', async () => {
    const client = new UserMCPClient({
      id: '1',
      name: 'evil',
      url: 'http://localhost:5432/mcp',
      authType: 'none',
    });
    await expect(client.connect()).rejects.toThrow(/Unsichere MCP-Server-URL/);
  });

  it('refuses the cloud metadata endpoint', async () => {
    const client = new UserMCPClient({
      id: '2',
      name: 'meta',
      url: 'http://169.254.169.254/latest/meta-data',
      authType: 'none',
    });
    await expect(client.connect()).rejects.toThrow(/Unsichere MCP-Server-URL/);
  });
});
