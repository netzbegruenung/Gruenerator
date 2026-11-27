import { readFileSync } from 'node:fs';

import { DEFAULT_SYSTEM_AGENT_ID, SKILLS, resolveSkillMention } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

/**
 * Die Migration `zz_20261127_library_recipes_for_agents.sql` gibt jedem
 * Bibliothekseintrag eines Agents, der hinter einem Rezept steht, sein
 * Standard-Rezept dazu (#6122). Die Zuordnung steht als VALUES-Liste im SQL;
 * ein Tippfehler darin legte still einen Eintrag an, den keine Übersicht
 * auflösen kann.
 */
const sql = readFileSync(
  new URL(
    '../../database/postgres/migrations/zz_20261127_library_recipes_for_agents.sql',
    import.meta.url
  ),
  'utf8'
);
const pairs = [...sql.matchAll(/\('([a-z0-9-]+)', '([a-z0-9-]+)'\)/g)].map(([, agent, recipe]) => ({
  agent: agent!,
  recipe: recipe!,
}));

describe('library recipes migration', () => {
  it('maps every agent to a recipe it owns', () => {
    expect(pairs.length).toBeGreaterThan(0);
    for (const { agent, recipe } of pairs) {
      expect(resolveSkillMention(recipe), `${agent} → ${recipe}`).toBe(agent);
    }
  });

  it('covers every agent that owns a recipe, once', () => {
    const owners = new Set(
      SKILLS.map((s) => s.identifier).filter((id) => id !== DEFAULT_SYSTEM_AGENT_ID)
    );
    expect(pairs.map((p) => p.agent).sort()).toEqual([...owners].sort());
  });
});
