import { getSystemAgent, resolveSkillMention, SKILLS } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { CODE_RECIPE_BODIES } from '../../../../services/skills/codeRecipes.js';

import { getPipelineAgent, getPipelineAgentForRecipe, recipePipelineAgentId } from './index.js';

/**
 * Seit 11/2026 stehen die Rezepte „Einfache Sprache" und „Leichte Sprache" vor
 * ihren Agenten. Das Rezept ist nur der Auslöser; die Kette bleibt Code.
 */
const PIPELINES = ['gruenerator-einfache-sprache', 'gruenerator-leichte-sprache'].map((id) => {
  const pipeline = getPipelineAgent(id);
  if (!pipeline) throw new Error(`keine Pipeline für ${id}`);
  return pipeline;
});

describe('Übertragungs-Rezepte', () => {
  it('jede Pipeline hat ein Systemrezept, das ihrem Agenten gehört', () => {
    for (const pipeline of PIPELINES) {
      expect(SKILLS.some((s) => s.mention === pipeline.recipeMention)).toBe(true);
      expect(resolveSkillMention(pipeline.recipeMention)).toBe(pipeline.identifier);
      // Der Agent bleibt auflösbar: alte Threads, Links, Likes.
      expect(getSystemAgent(pipeline.identifier)).toBeDefined();
    }
  });

  it('findet die Pipeline über das Rezept, auch mit Großschreibung', () => {
    expect(getPipelineAgentForRecipe('leichte-sprache')?.identifier).toBe(
      'gruenerator-leichte-sprache'
    );
    expect(getPipelineAgentForRecipe('Einfache-Sprache')?.identifier).toBe(
      'gruenerator-einfache-sprache'
    );
    expect(getPipelineAgentForRecipe('presse')).toBeNull();
    expect(getPipelineAgentForRecipe(null)).toBeNull();
  });

  it('übernimmt den Agenten nur auf dem Standard-Agenten', () => {
    expect(recipePipelineAgentId(undefined, 'leichte-sprache')).toBe('gruenerator-leichte-sprache');
    expect(recipePipelineAgentId('gruenerator-universal', 'einfache-sprache')).toBe(
      'gruenerator-einfache-sprache'
    );
    // Ein ausdrücklich gewählter Agent gewinnt.
    expect(recipePipelineAgentId('gruenerator-antrag', 'leichte-sprache')).toBeNull();
    expect(recipePipelineAgentId('gruenerator-universal', 'presse')).toBeNull();
    expect(recipePipelineAgentId('gruenerator-universal', null)).toBeNull();
  });

  it('der Rezept-Rumpf ist das Regelwerk der Fassung, aus dem Code', () => {
    for (const pipeline of PIPELINES) {
      const body = CODE_RECIPE_BODIES[pipeline.recipeMention];
      expect(body).toBeDefined();
      expect(body?.({ kinds: [] })).toBe(pipeline.systemRole);
    }
  });
});
