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

/**
 * A teammate's agent now routes by its row uuid, which is the mentionable's
 * `identifier`. Threads started before that carry the readable identifier,
 * which is the mentionable's `mention`.
 */
describe('resolveMessageAgent — shared user agents', () => {
  const shared = mentionable({
    type: 'useragent',
    identifier: '44444444-4444-4444-8444-444444444444',
    title: 'Wahlkampf',
    mention: 'wahlkampf-xy',
  });

  it('resolves by row uuid', () => {
    expect(resolveMessageAgent({ agentId: shared.identifier }, SYSTEM, [shared])?.title).toBe(
      'Wahlkampf'
    );
  });

  it('resolves an older thread by the readable identifier', () => {
    expect(resolveMessageAgent({ agentId: 'wahlkampf-xy' }, SYSTEM, [shared])?.title).toBe(
      'Wahlkampf'
    );
  });

  it('does not match a recipe by its mention', () => {
    expect(resolveMessageAgent({ agentId: 'mein-rezept' }, SYSTEM, CUSTOM)).toBeNull();
  });
});

describe('resolveMessageAgent for a public agent', () => {
  const PUBLIC = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Kims Pressestelle',
      avatar: '🌻',
      backgroundColor: '#005437',
    },
  ];

  it('names a public agent that is in no mention catalogue by its row uuid', () => {
    const agent = resolveMessageAgent(
      { agentId: '33333333-3333-4333-8333-333333333333' },
      SYSTEM,
      CUSTOM,
      PUBLIC
    );

    expect(agent?.title).toBe('Kims Pressestelle');
  });

  it('prefers the catalogues over the public list', () => {
    expect(resolveMessageAgent({ agentId: 'ua-1' }, SYSTEM, CUSTOM, PUBLIC)?.title).toBe(
      'Mein Rezept'
    );
  });
});
