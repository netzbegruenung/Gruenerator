/**
 * MCP (Model Context Protocol) Client
 * Handles communication with the MCP server for tool execution
 */

const MCP_SERVER_URL = process.env.MCP_URL || 'http://localhost:3003';

let sessionId: string | null = null;
let sessionInitPromise: Promise<void> | null = null;

async function initializeSession(): Promise<void> {
  if (sessionId) return;

  const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'gruenerator-api-chat',
          version: '1.0.0',
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP initialize failed: ${response.statusText}`);
  }

  const newSessionId = response.headers.get('mcp-session-id');
  if (!newSessionId) {
    throw new Error('MCP server did not return session ID');
  }

  sessionId = newSessionId;

  await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
}

async function ensureSession(): Promise<void> {
  if (sessionId) return;

  if (!sessionInitPromise) {
    sessionInitPromise = initializeSession().catch((err) => {
      sessionInitPromise = null;
      throw err;
    });
  }

  await sessionInitPromise;
}

function parseToolResult<T>(result: unknown): T {
  const content = (result as { result?: { content?: Array<{ text?: string }> } })?.result?.content;

  if (Array.isArray(content) && content.length > 0 && content[0].text) {
    try {
      return JSON.parse(content[0].text) as T;
    } catch {
      return content[0].text as unknown as T;
    }
  }

  return result as T;
}

async function callMcpTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  await ensureSession();

  const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId!,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 400) {
      sessionId = null;
      sessionInitPromise = null;
      await ensureSession();

      const retryResponse = await fetch(`${MCP_SERVER_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!retryResponse.ok) {
        throw new Error(`MCP request failed after retry: ${retryResponse.statusText}`);
      }

      const retryResult = await retryResponse.json();
      if (retryResult.error) {
        throw new Error(`MCP error: ${retryResult.error.message}`);
      }

      return parseToolResult<T>(retryResult);
    }

    throw new Error(`MCP request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`);
  }

  return parseToolResult<T>(result);
}

export interface SearchResult {
  collection: string;
  query: string;
  searchMode: string;
  resultsCount: number;
  results: Array<{
    rank: number;
    relevance: string;
    source: string;
    url?: string;
    excerpt: string;
    searchMethod: string;
  }>;
  cached?: boolean;
  error?: boolean;
  message?: string;
}

export interface PersonResult {
  isPersonQuery: boolean;
  person?: {
    name: string;
    fraktion?: string;
    wahlkreis?: string;
  };
  results: Array<{
    rank: number;
    relevance: string;
    source: string;
    url?: string;
    type: string;
    excerpt: string;
  }>;
  error?: boolean;
  message?: string;
}

export interface ExampleResult {
  resultsCount: number;
  examples: Array<{
    id: string;
    platform: string;
    content: string;
    imageUrl?: string;
    author?: string;
    date?: string;
  }>;
  error?: boolean;
  message?: string;
}

export async function executeSearch(params: {
  query: string;
  collection?: string;
  searchMode?: string;
  limit?: number;
}): Promise<SearchResult> {
  return callMcpTool<SearchResult>('gruenerator_search', params);
}

export async function executePersonSearch(params: { query: string }): Promise<PersonResult> {
  return callMcpTool<PersonResult>('gruenerator_person_search', params);
}

export async function executeExamplesSearch(params: {
  query: string;
  platform?: string;
  country?: string;
}): Promise<ExampleResult> {
  return callMcpTool<ExampleResult>('gruenerator_examples_search', params);
}

export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'gruenerator_search':
      return executeSearch(args as Parameters<typeof executeSearch>[0]);
    case 'gruenerator_person_search':
      return executePersonSearch(args as Parameters<typeof executePersonSearch>[0]);
    case 'gruenerator_examples_search':
      return executeExamplesSearch(args as Parameters<typeof executeExamplesSearch>[0]);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function resetSession(): void {
  sessionId = null;
  sessionInitPromise = null;
}
