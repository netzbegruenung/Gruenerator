import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

vi.mock('./threadPersistenceService.js', () => ({
  createMessage: vi.fn(() => Promise.resolve()),
  touchThread: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../services/search/searchRetryStrategy.js', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../agents/langgraph/ChatGraph/nodes/socialMediaComposerNode.js', () => ({
  rubricForPlatform: () => '## RUBRIK',
}));

// Der Sitz der Attrappe ist die Maschine, nicht der Client: der Editier-Pfad
// geht über `aiText`, und das ruft `executeProvider` direkt.
const executeProvider = vi.fn();
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { handleSocialPostTextEdit, SOCIAL_EDIT_REFUSAL_TEXT } =
  await import('./socialPostEditService.js');

const ORIGINAL_TEXT = 'Klimaschutz heißt bezahlbar wohnen. #Klimaschutz';

function postRow() {
  return {
    id: 'm1',
    tool_results: {
      toolCalls: [
        {
          toolName: 'social_post',
          result: {
            postId: 'p1',
            text: ORIGINAL_TEXT,
            hashtags: ['#Klimaschutz'],
            charCount: ORIGINAL_TEXT.length,
            version: 1,
            platform: 'instagram',
            versions: [],
          },
        },
      ],
    },
  };
}

/** Routes the two SELECTs and records any UPDATE. */
function wirePostgres(): { updates: unknown[][] } {
  const updates: unknown[][] = [];
  query.mockImplementation((sql: string, params: unknown[]) => {
    if (sql.includes('UPDATE chat_messages')) {
      updates.push(params);
      return Promise.resolve([]);
    }
    if (sql.includes('SELECT id, tool_results')) return Promise.resolve([postRow()]);
    return Promise.resolve([{ tool_results: postRow().tool_results }]);
  });
  return { updates };
}

function makeSse() {
  const events: Array<{ type: string; payload: unknown }> = [];
  return {
    events,
    sse: {
      send: (type: string, payload: unknown) => events.push({ type, payload }),
      sendRaw: (type: string, payload: unknown) => events.push({ type, payload }),
      end: vi.fn(),
      isEnded: () => false,
    },
  };
}

function runEdit(modelOutput: string, sse: ReturnType<typeof makeSse>['sse']) {
  executeProvider.mockResolvedValue({ content: modelOutput, success: true, stop_reason: 'stop' });
  return handleSocialPostTextEdit({
    sse: sse as never,
    threadId: 't1',
    userId: 'u1',
    instruction: 'mach den Text empörter',
    startTime: 0,
  });
}

/**
 * The live failure: a request to fabricate a claim about a real politician was
 * routed into this EDIT branch. The model correctly declined — and the refusal
 * string itself ("I'm sorry, but I can't help with that.", 38 chars) was written
 * over a good Klimaschutz post as v2, while the chat reported "Ich habe den Text
 * angepasst." A decline destroyed an artifact and was reported as success.
 */
describe('handleSocialPostTextEdit — model declines', () => {
  // Braces matter: an arrow returning `mockReset()`'s value hands vitest the
  // mock itself, which it then calls as a teardown hook.
  beforeEach(() => {
    query.mockReset();
    executeProvider.mockReset();
  });

  it('does NOT write a version when the model refuses', async () => {
    const { updates } = wirePostgres();
    const { sse, events } = makeSse();

    const handled = await runEdit("I'm sorry, but I can't help with that.", sse);

    expect(handled).toBe(true);
    expect(updates).toEqual([]);
    expect(events.some((e) => e.type === 'social_post_updated')).toBe(false);
  });

  it('tells the user the post survived, without inviting a rephrasing', async () => {
    wirePostgres();
    const { sse, events } = makeSse();

    await runEdit("I'm sorry, but I can't help with that.", sse);

    const delta = events.find((e) => e.type === 'text_delta')?.payload as { text: string };
    expect(delta.text).toBe(SOCIAL_EDIT_REFUSAL_TEXT);
    expect(delta.text).toContain('bleibt unverändert');
    expect(delta.text).not.toMatch(/anders formulieren|magst du/i);
  });

  it('catches a German refusal too', async () => {
    const { updates } = wirePostgres();
    const { sse } = makeSse();

    await runEdit('Dabei kann ich dir leider nicht helfen.', sse);

    expect(updates).toEqual([]);
  });

  it('still applies a legitimate edit', async () => {
    const { updates } = wirePostgres();
    const { sse, events } = makeSse();

    const handled = await runEdit('Wohnen muss bezahlbar bleiben! #Klimaschutz #Wohnen', sse);

    expect(handled).toBe(true);
    expect(updates).toHaveLength(1);
    const updated = events.find((e) => e.type === 'social_post_updated');
    expect(updated).toBeDefined();
    const delta = events.find((e) => e.type === 'text_delta')?.payload as { text: string };
    expect(delta.text).toContain('angepasst');
  });
});
