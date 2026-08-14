/**
 * Transport selection for user-supplied MCP servers.
 *
 * Own file because the SSRF guard has to be mocked away here, while
 * UserMCPClient.vitest.ts exercises the real one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  /** Transport kinds in the order connect() tried them. */
  attempts: [] as string[],
  /** Kinds whose handshake should fail. */
  failing: new Set<string>(),
}));

vi.mock('../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (url: string) => Promise.resolve({ isValid: true, url }),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect(transport: { kind: string }) {
      h.attempts.push(transport.kind);
      return h.failing.has(transport.kind)
        ? Promise.reject(new Error(`${transport.kind} kaputt`))
        : Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    kind = 'http';
    protocolVersion = '2025-06-18';
    close() {
      return Promise.resolve();
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class {
    kind = 'sse';
    close() {
      return Promise.resolve();
    }
  },
}));

const { UserMCPClient } = await import('./UserMCPClient.js');

function connectTo(url: string) {
  return new UserMCPClient({ id: '1', name: 'Test', url, authType: 'none' });
}

beforeEach(() => {
  h.attempts.length = 0;
  h.failing.clear();
});

describe('UserMCPClient transport selection', () => {
  it('starts with StreamableHTTP for an ordinary URL', async () => {
    const client = connectTo('https://example.invalid/mcp');
    await client.connect();
    expect(h.attempts).toEqual(['http']);
    expect(client.transportKind).toBe('http');
    expect(client.protocolVersion).toBe('2025-06-18');
  });

  it.each(['https://example.invalid/sse', 'https://example.invalid/sse/'])(
    'starts with SSE for %s',
    async (url) => {
      // The trailing slash used to defeat the endsWith('/sse') check and put an
      // SSE-only server on the wrong transport.
      await connectTo(url).connect();
      expect(h.attempts[0]).toBe('sse');
    }
  );

  it('falls back to the other transport when the first handshake fails', async () => {
    h.failing.add('http');
    const client = connectTo('https://example.invalid/mcp');
    await client.connect();
    expect(h.attempts).toEqual(['http', 'sse']);
    expect(client.transportKind).toBe('sse');
  });

  it('reports the first failure when neither transport connects', async () => {
    h.failing.add('http');
    h.failing.add('sse');
    await expect(connectTo('https://example.invalid/mcp').connect()).rejects.toThrow('http kaputt');
    expect(h.attempts).toEqual(['http', 'sse']);
  });
});
