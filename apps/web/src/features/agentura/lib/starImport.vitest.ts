import { describe, expect, it } from 'vitest';

import { starredLibraryRefs } from './starImport';

import type { AgentEntry, RecipeEntry } from './marketItems';

const agent = (identifier: string, id: string | null = null): AgentEntry =>
  ({ agent: { identifier, id }, isUser: false, editable: false }) as unknown as AgentEntry;

const recipe = (mention: string, id: string | null, editable = false): RecipeEntry => ({
  mention,
  title: mention,
  description: '',
  icon: null,
  editable,
  id,
  shareLabel: null,
});

const base = {
  agentStars: [] as string[],
  recipeStars: [] as string[],
  shopAgents: new Map<string, AgentEntry>(),
  shopRecipes: new Map<string, RecipeEntry>(),
  ownAgentKeys: new Set<string>(),
};

describe('starredLibraryRefs', () => {
  it('takes starred shop agents by their agentRef', () => {
    const shopAgents = new Map([
      ['gruenerator-rede', agent('gruenerator-rede')],
      ['uuid-1', agent('kampagne', 'uuid-1')],
    ]);
    expect(
      starredLibraryRefs({ ...base, shopAgents, agentStars: ['gruenerator-rede', 'uuid-1', 'weg'] })
    ).toEqual([
      { kind: 'agent', ref: 'gruenerator-rede' },
      { kind: 'agent', ref: 'uuid-1' },
    ]);
  });

  it('resolves a pre-uuid star by identifier only when one agent carries it', () => {
    const shopAgents = new Map([
      ['uuid-1', agent('kampagne', 'uuid-1')],
      ['uuid-2', agent('doppelt', 'uuid-2')],
      ['uuid-3', agent('doppelt', 'uuid-3')],
    ]);
    expect(
      starredLibraryRefs({ ...base, shopAgents, agentStars: ['kampagne', 'doppelt'] })
    ).toEqual([{ kind: 'agent', ref: 'uuid-1' }]);
  });

  it('leaves out the caller’s own public agents', () => {
    const shopAgents = new Map([['uuid-1', agent('mein-agent', 'uuid-1')]]);
    expect(
      starredLibraryRefs({
        ...base,
        shopAgents,
        agentStars: ['uuid-1'],
        ownAgentKeys: new Set(['uuid-1']),
      })
    ).toEqual([]);
  });

  it('prefers the catalogue recipe, else only an unambiguous public recipe', () => {
    const shopRecipes = new Map([
      ['pressemitteilung', recipe('pressemitteilung', null)],
      ['row-1', recipe('pressemitteilung', 'row-1')],
      ['row-2', recipe('wahlaufruf', 'row-2')],
      ['row-3', recipe('flyer', 'row-3')],
      ['row-4', recipe('flyer', 'row-4')],
      ['row-5', recipe('eigenes', 'row-5', true)],
    ]);
    expect(
      starredLibraryRefs({
        ...base,
        shopRecipes,
        recipeStars: ['pressemitteilung', 'wahlaufruf', 'flyer', 'eigenes'],
      })
    ).toEqual([
      { kind: 'recipe', ref: 'pressemitteilung' },
      { kind: 'recipe', ref: 'row-2' },
    ]);
  });
});
