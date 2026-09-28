import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '../stores/chatStore';
import { useUserAgentsRegistry, type RegistryAgent } from '../stores/userAgentsRegistry';

import { useActiveAgentMeta } from './useActiveAgentMeta';

/**
 * A colleague's agent is selected by its row uuid (`agentRef`), the caller's
 * own by its identifier — and two owners may use the same identifier (#3788).
 */

function agent(id: string, identifier: string, title: string): RegistryAgent {
  return {
    id,
    identifier,
    title,
    description: `${title} beschreibt sich`,
    avatar: '🌻',
    backgroundColor: '#005437',
    tags: [],
    model: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.5 },
    openingMessage: '',
    openingQuestions: [`Frag ${title}`],
    locale: 'de-DE',
    author: 'Eigene*r Agent*in',
  } as RegistryAgent;
}

const COLLEAGUE_ID = '22222222-2222-4222-8222-222222222222';
const OWN = agent('11111111-1111-4111-8111-111111111111', 'pressestelle', 'Meine Pressestelle');
const COLLEAGUE = agent(COLLEAGUE_ID, 'pressestelle', 'Pressestelle von Kim');

function titleFor(selectedAgentId: string): string | undefined {
  useAgentStore.setState({ selectedAgentId });
  const { result } = renderHook(() => useActiveAgentMeta());
  return result.current?.title;
}

beforeEach(() => {
  useUserAgentsRegistry.getState().setUserAgents([OWN, COLLEAGUE]);
});

describe('useActiveAgentMeta for user agents', () => {
  it("resolves a colleague's agent by its row uuid", () => {
    expect(titleFor(COLLEAGUE_ID)).toBe('Pressestelle von Kim');
  });

  it('resolves an identifier to the own agent listed first', () => {
    expect(titleFor('pressestelle')).toBe('Meine Pressestelle');
  });

  it('carries the opening questions for the welcome screen', () => {
    useAgentStore.setState({ selectedAgentId: COLLEAGUE_ID });
    const { result } = renderHook(() => useActiveAgentMeta());
    expect(result.current?.openingQuestions).toEqual(['Frag Pressestelle von Kim']);
  });
});
