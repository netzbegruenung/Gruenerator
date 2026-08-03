import { describe, expect, it } from 'vitest';

import { resolveMessageAgent, shouldShowAgentBadge } from './messageAgent';

import type { Mentionable } from '@gruenerator/chat';

function mentionable(overrides: Partial<Mentionable> = {}): Mentionable {
  return {
    type: 'agent',
    category: 'skill',
    trigger: '@',
    identifier: 'gruenerator-presse',
    title: 'Pressemitteilung',
    description: '',
    avatar: '📰',
    backgroundColor: '#316049',
    mention: 'presse',
    ...overrides,
  };
}

const SYSTEM = [
  mentionable(),
  mentionable({ identifier: 'gruenerator-chat', title: 'Grünerator', mention: 'chat' }),
];
const CUSTOM = [
  mentionable({ identifier: 'ua-1', title: 'Mein Rezept', mention: 'mein-rezept', avatar: '🤖' }),
];

describe('resolveMessageAgent', () => {
  it('resolves by mention', () => {
    const agent = resolveMessageAgent({ agentMention: 'presse' }, SYSTEM, CUSTOM);

    expect(agent?.title).toBe('Pressemitteilung');
    expect(agent?.avatar).toBe('📰');
  });

  it('resolves by identifier', () => {
    expect(resolveMessageAgent({ agentId: 'gruenerator-presse' }, SYSTEM, CUSTOM)?.title).toBe(
      'Pressemitteilung'
    );
  });

  it('finds user recipes, which are not in the skills catalogue', () => {
    expect(resolveMessageAgent({ agentId: 'ua-1' }, SYSTEM, CUSTOM)?.title).toBe('Mein Rezept');
  });

  // The mention is what the user typed, so it has to survive an identifier that
  // changed underneath an already-persisted thread.
  it('prefers the mention over the identifier', () => {
    const agent = resolveMessageAgent(
      { agentMention: 'presse', agentId: 'gruenerator-chat' },
      SYSTEM,
      CUSTOM
    );

    expect(agent?.title).toBe('Pressemitteilung');
  });

  it('falls back to the identifier when the mention no longer exists', () => {
    const agent = resolveMessageAgent(
      { agentMention: 'abgeschafft', agentId: 'gruenerator-presse' },
      SYSTEM,
      CUSTOM
    );

    expect(agent?.title).toBe('Pressemitteilung');
  });

  // Notebook-QA and eigener Chat set neither field. Falling back to the
  // currently selected agent would stamp its name onto a notebook answer.
  it('is null when the message names no agent', () => {
    expect(resolveMessageAgent({}, SYSTEM, CUSTOM)).toBeNull();
    expect(resolveMessageAgent(null, SYSTEM, CUSTOM)).toBeNull();
  });

  it('is null for an agent that no longer exists at all', () => {
    expect(resolveMessageAgent({ agentId: 'geloescht' }, SYSTEM, CUSTOM)).toBeNull();
  });
});

describe('shouldShowAgentBadge', () => {
  const agent = {
    identifier: 'gruenerator-presse',
    title: 'x',
    avatar: '📰',
    backgroundColor: '#0',
  };

  it('names a non-default agent', () => {
    expect(shouldShowAgentBadge(agent, 'gruenerator-chat')).toBe(true);
  });

  it('stays silent for the house voice', () => {
    expect(
      shouldShowAgentBadge({ ...agent, identifier: 'gruenerator-chat' }, 'gruenerator-chat')
    ).toBe(false);
  });

  it('stays silent when nothing resolved', () => {
    expect(shouldShowAgentBadge(null, 'gruenerator-chat')).toBe(false);
  });
});
