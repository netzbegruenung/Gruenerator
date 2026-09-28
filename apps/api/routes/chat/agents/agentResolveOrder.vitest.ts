/**
 * The resolution ladder in `getAgentForUser`: system registry → the caller's own
 * row → a row shared into one of their groups → a row its owner opened to every
 * signed-in user (`share_mode='authenticated'`).
 *
 * The last rung is #3469: the Agentura community shelf listed such agents while
 * the chat route could not load them, so the card was clickable and the turn
 * fell back to the default agent. The order matters as much as the branch —
 * an owner's own row must keep winning over a public row with the same
 * identifier, because `identifier` is unique per owner, not globally.
 *
 * Run with: cd apps/api && npx vitest run routes/chat/agents/agentResolveOrder.vitest.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserAgent = vi.fn();
const getGroupSharedUserAgent = vi.fn();
const getPublicUserAgent = vi.fn();
const getAccessibleUserAgentById = vi.fn();

vi.mock('../../../services/userAgents/userAgentsRepository.js', () => ({
  getAccessibleUserAgentById: (...a: unknown[]) => getAccessibleUserAgentById(...a),
  getUserAgent: (...a: unknown[]) => getUserAgent(...a),
  getGroupSharedUserAgent: (...a: unknown[]) => getGroupSharedUserAgent(...a),
  getPublicUserAgent: (...a: unknown[]) => getPublicUserAgent(...a),
}));
vi.mock('../../../services/skills/internalPrompts.js', () => ({
  getInternalAgentPrompt: () => null,
}));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn(), queryOne: vi.fn() }),
}));

const { getAgentForUser } = await import('./agentLoader.js');

const USER = '11111111-1111-4111-8111-111111111111';
/** An identifier the shipped registry does not carry, so the built-in branch misses. */
const IDENTIFIER = 'klima-gruenerator-testfall';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';

const agent = (title: string) => ({
  identifier: IDENTIFIER,
  title,
  description: 'd',
  systemRole: 'r',
  avatar: '🌱',
  backgroundColor: '#fff',
  tags: [],
  model: 'mistral-medium-2604',
  provider: 'mistral',
  params: { max_tokens: 100, temperature: 0.7 },
  openingMessage: '',
  openingQuestions: [],
  locale: 'de-DE',
  author: 'a',
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserAgent.mockResolvedValue(undefined);
  getGroupSharedUserAgent.mockResolvedValue(undefined);
  getPublicUserAgent.mockResolvedValue(undefined);
  getAccessibleUserAgentById.mockResolvedValue(undefined);
});

describe('getAgentForUser — resolution order', () => {
  it('resolves a publicly opened agent for someone who neither owns nor shares it', async () => {
    getPublicUserAgent.mockResolvedValue(agent('öffentlich'));

    const resolved = await getAgentForUser(IDENTIFIER, USER);

    expect(resolved?.title).toBe('öffentlich');
    expect(resolved?.isUserAgent).toBe(true);
    expect(getPublicUserAgent).toHaveBeenCalledWith(IDENTIFIER);
  });

  it('prefers the caller’s own row over a group and a public row of the same name', async () => {
    getUserAgent.mockResolvedValue(agent('eigener'));
    getGroupSharedUserAgent.mockResolvedValue(agent('geteilt'));
    getPublicUserAgent.mockResolvedValue(agent('öffentlich'));

    expect((await getAgentForUser(IDENTIFIER, USER))?.title).toBe('eigener');
    // The cheaper branches must also SHORT-CIRCUIT, not merely rank first.
    expect(getGroupSharedUserAgent).not.toHaveBeenCalled();
    expect(getPublicUserAgent).not.toHaveBeenCalled();
  });

  it('prefers a group-shared row over a public one', async () => {
    getGroupSharedUserAgent.mockResolvedValue(agent('geteilt'));
    getPublicUserAgent.mockResolvedValue(agent('öffentlich'));

    expect((await getAgentForUser(IDENTIFIER, USER))?.title).toBe('geteilt');
    expect(getPublicUserAgent).not.toHaveBeenCalled();
  });

  it('returns undefined when no rung matches', async () => {
    expect(await getAgentForUser(IDENTIFIER, USER)).toBeUndefined();
    expect(getPublicUserAgent).toHaveBeenCalledWith(IDENTIFIER);
  });

  it('never reaches the database when the built-in registry already answers', async () => {
    // The default system agent is shipped in the registry; a DB row of the
    // same identifier must not get a chance to shadow it.
    const resolved = await getAgentForUser('gruenerator-universal', USER);

    expect(resolved).toBeDefined();
    expect(getUserAgent).not.toHaveBeenCalled();
    expect(getPublicUserAgent).not.toHaveBeenCalled();
  });
});

/**
 * A uuid names exactly one row, so it needs no ladder — one lookup that checks
 * owner, group share and public access at once. A miss is final: falling back
 * to the identifier rungs could hand the caller a different owner's agent.
 */
describe('getAgentForUser — uuid handle', () => {
  it('loads the row by id and skips the identifier ladder', async () => {
    getAccessibleUserAgentById.mockResolvedValue(agent('per id'));
    getUserAgent.mockResolvedValue(agent('eigener'));

    const resolved = await getAgentForUser(AGENT_ID, USER);

    expect(resolved?.title).toBe('per id');
    expect(resolved?.isUserAgent).toBe(true);
    expect(getAccessibleUserAgentById).toHaveBeenCalledWith(AGENT_ID, USER);
    expect(getUserAgent).not.toHaveBeenCalled();
    expect(getGroupSharedUserAgent).not.toHaveBeenCalled();
    expect(getPublicUserAgent).not.toHaveBeenCalled();
  });

  it('resolves nothing when no accessible row has that id', async () => {
    getPublicUserAgent.mockResolvedValue(agent('fremder, uuid-förmiger Bezeichner'));

    expect(await getAgentForUser(AGENT_ID, USER)).toBeUndefined();
    expect(getUserAgent).not.toHaveBeenCalled();
    expect(getPublicUserAgent).not.toHaveBeenCalled();
  });

  it('never looks an identifier up by id', async () => {
    await getAgentForUser(IDENTIFIER, USER);
    expect(getAccessibleUserAgentById).not.toHaveBeenCalled();
  });
});
