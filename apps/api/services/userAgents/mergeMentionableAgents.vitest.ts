/**
 * Welchen Grünerator bietet das Erwähnungsmenü unter einem Bezeichner an?
 *
 * `user_agents.identifier` ist nur pro Besitzer*in eindeutig — zwei Personen
 * dürfen beide einen `klima-gruenerator` haben. Das Menü muss dieselbe Reihe
 * fahren wie `getAgentForUser` (eigene Zeile → erster Gruppen-Share), sonst
 * zeigt es den einen und der Chat lädt den anderen (#2909).
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, expect, it } from 'vitest';

import { mergeMentionableAgents, type MentionableUserAgentRow } from './userAgentsRepository.js';

const agent = (
  identifier: string,
  title: string,
  sharedFromGroup: string | null
): MentionableUserAgentRow => ({
  identifier,
  title,
  description: 'Ein Grünerator',
  avatar: '🌱',
  backgroundColor: '#316049',
  sharedFromGroup,
});

describe('mergeMentionableAgents', () => {
  it('stellt eigene voran und hängt geteilte an', () => {
    const merged = mergeMentionableAgents(
      [agent('mein-agent', 'Mein Agent', null)],
      [agent('kv-agent', 'KV Agent', 'KV Köln')]
    );
    expect(merged.map((a) => a.identifier)).toEqual(['mein-agent', 'kv-agent']);
    expect(merged.map((a) => a.sharedFromGroup)).toEqual([null, 'KV Köln']);
  });

  it('lässt den eigenen Agenten gewinnen, wenn ein Share denselben Bezeichner trägt', () => {
    const merged = mergeMentionableAgents(
      [agent('klima-gruenerator', 'Meiner', null)],
      [agent('klima-gruenerator', 'Der aus der Gruppe', 'KV Köln')]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Meiner');
    expect(merged[0].sharedFromGroup).toBeNull();
  });

  it('nimmt bei zwei Shares desselben Bezeichners den ersten', () => {
    const merged = mergeMentionableAgents(
      [],
      [
        agent('klima-gruenerator', 'Aus Köln', 'KV Köln'),
        agent('klima-gruenerator', 'Aus Bonn', 'KV Bonn'),
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].sharedFromGroup).toBe('KV Köln');
  });
});
