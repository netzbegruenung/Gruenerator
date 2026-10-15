import { describe, expect, it } from 'vitest';

import { SYSTEM_AGENTS, getAgentSlug, type Agent } from '../agents/index.js';

import { resolveAgentBySlug } from './agentLookup.js';

const agent = (over: Partial<Agent>): Agent => ({ ...SYSTEM_AGENTS[0]!, tags: [], ...over });

const OWN = agent({ id: '11111111-1111-4111-8111-111111111111', identifier: 'mein-agent-ab12cd' });
const FOREIGN = agent({
  id: '22222222-2222-4222-8222-222222222222',
  identifier: 'mein-agent-ab12cd',
});
const lists = { own: [OWN], shared: [], public: [FOREIGN] };

describe('resolveAgentBySlug', () => {
  it('resolves a system agent by its slug', () => {
    const system = SYSTEM_AGENTS[0]!;
    const result = resolveAgentBySlug(getAgentSlug(system.identifier), lists);
    expect(result).toEqual({ agent: system, isUserAgent: false, isOwn: false });
  });

  it('prefers the caller’s own agent for a shared identifier', () => {
    expect(resolveAgentBySlug('mein-agent-ab12cd', lists)).toEqual({
      agent: OWN,
      isUserAgent: true,
      isOwn: true,
    });
  });

  it('reaches someone else’s agent by its row uuid', () => {
    expect(resolveAgentBySlug(FOREIGN.id!, lists)).toEqual({
      agent: FOREIGN,
      isUserAgent: true,
      isOwn: false,
    });
  });

  it('answers not found for an unknown slug', () => {
    expect(resolveAgentBySlug('gibt-es-nicht', lists).agent).toBeNull();
  });
});
