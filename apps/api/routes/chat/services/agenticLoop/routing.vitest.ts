import { describe, it, expect } from 'vitest';

import { looksLikeToolableQuestion, decideRunAgentic } from './routing.js';

describe('looksLikeToolableQuestion', () => {
  const toolable: [string, string][] = [
    ['abgeordnetenwatch', 'Wie hat Renate Künast zuletzt im Bundestag abgestimmt?'],
    ['bundestag', 'Welche Anträge hat die Grüne Fraktion zum Thema Mieten gestellt?'],
    ['program search', 'Was steht im Grundsatzprogramm zum Klimaschutz?'],
    ['imperative', 'Nenne mir drei zentrale Klimaziele der Grünen.'],
    ['research verb', 'Recherchiere die grüne Position zum Tempolimit bitte.'],
    ['no qmark but interrogative', 'Erkläre mir die grüne Position zur Kindergrundsicherung'],
  ];
  it.each(toolable)('routes a real question into the loop: %s', (_label, q) => {
    expect(looksLikeToolableQuestion(q)).toBe(true);
  });

  const fastPath: [string, string][] = [
    ['greeting', 'Hallo!'],
    ['short who', 'Wer bist du?'],
    ['short howareyou', "Wie geht's?"],
    ['identity', 'Was kannst du?'],
    ['thanks', 'Danke dir, super gemacht.'],
    ['creative imperative', 'Schreib mir ein kurzes Gedicht über Windkraft.'],
    ['empty', '   '],
  ];
  it.each(fastPath)('keeps a fast-path turn out of the loop: %s', (_label, q) => {
    expect(looksLikeToolableQuestion(q)).toBe(false);
  });
});

describe('decideRunAgentic', () => {
  const AGENTIC = new Set([
    'search',
    'web',
    'examples',
    'pressemitteilung_examples',
    'compare',
    'mcp',
    'summary',
    'bundestag',
    'abgeordnetenwatch',
    'image',
  ]);
  const base = {
    loopEnabled: true,
    agenticIntents: AGENTIC,
    intent: 'search',
    lastUserText: 'Was steht im Programm zum Klimaschutz?',
    forcedTool: false,
    isMcpTurn: false,
    isCompound: false,
    hasSecondaryIntent: false,
    hasImageAttachments: false,
  };
  const decide = (o: Partial<typeof base>) => decideRunAgentic({ ...base, ...o });

  it('runs the loop for a whitelisted intent', () => {
    expect(decide({ intent: 'search' })).toBe(true);
    expect(decide({ intent: 'bundestag' })).toBe(true);
  });

  it('rescues a factual question mislabelled `direct`', () => {
    expect(
      decide({ intent: 'direct', lastUserText: 'Wie hat Robert Habeck abgestimmt?' })
    ).toBe(true);
  });

  it('keeps a greeting mislabelled `direct` on the fast path', () => {
    expect(decide({ intent: 'direct', lastUserText: 'Hallo, wer bist du?' })).toBe(false);
  });

  it('never loops a generation intent (fixed UX contract)', () => {
    expect(decide({ intent: 'sharepic' })).toBe(false);
    expect(decide({ intent: 'social_post' })).toBe(false);
  });

  it('forced @tool stays single-pass — except mcp (connector pick)', () => {
    expect(decide({ forcedTool: true })).toBe(false);
    expect(decide({ intent: 'mcp', forcedTool: true, isMcpTurn: true })).toBe(true);
  });

  it('multi-intent / notebook-compound / attachments stay single-pass', () => {
    expect(decide({ hasSecondaryIntent: true })).toBe(false);
    expect(decide({ isCompound: true })).toBe(false);
    expect(decide({ hasImageAttachments: true })).toBe(false);
  });

  it('respects the flag', () => {
    expect(decide({ loopEnabled: false })).toBe(false);
  });

  it('enters the loop regardless of the selected model (planner does the tools)', () => {
    // No tool-capability gate: the split lets any model into the loop.
    expect(decide({ intent: 'search' })).toBe(true);
  });
});
