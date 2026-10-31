import { describe, expect, it } from 'vitest';

import { partitionTurnRecipes } from './turnRecipes.js';

describe('partitionTurnRecipes', () => {
  it('keeps a lone text form in the exclusive slot, as before', () => {
    expect(partitionTurnRecipes({ tokenSkillMentions: ['presse'] })).toEqual({
      textsorte: 'presse',
      textsorteFromToken: true,
      methods: [],
      droppedTextsorten: [],
    });
  });

  it('puts a method recipe next to the composer text form instead of replacing it', () => {
    const picks = partitionTurnRecipes({
      tokenSkillMentions: ['rechtsstand'],
      bodySkillMention: 'rechtsstand',
      ambientSkillMention: 'buerger-berlin',
    });
    expect(picks.textsorte).toBe('buerger-berlin');
    expect(picks.textsorteFromToken).toBe(false);
    expect(picks.methods).toEqual(['rechtsstand']);
  });

  it('two picked text forms: the last token wins (unchanged), the other is reported', () => {
    const picks = partitionTurnRecipes({
      tokenSkillMentions: ['presse', 'instagram'],
      bodySkillMention: 'instagram',
      ambientSkillMention: 'buerger-berlin',
    });
    expect(picks.textsorte).toBe('instagram');
    expect(picks.droppedTextsorten).toEqual(['presse', 'buerger-berlin']);
  });

  it('two methods and a text form all load', () => {
    const picks = partitionTurnRecipes({
      tokenSkillMentions: ['bundestagsrecherche', 'presse', 'rechtsstand'],
    });
    expect(picks.textsorte).toBe('presse');
    expect(picks.methods).toEqual(['bundestagsrecherche', 'rechtsstand']);
  });

  it('falls back to the body pick when no token names a text form', () => {
    const picks = partitionTurnRecipes({ tokenSkillMentions: [], bodySkillMention: 'presse' });
    expect(picks.textsorte).toBe('presse');
    expect(picks.textsorteFromToken).toBe(false);
  });

  it('treats unknown (user) recipes as text forms', () => {
    expect(partitionTurnRecipes({ tokenSkillMentions: ['omveinladungen'] }).textsorte).toBe(
      'omveinladungen'
    );
  });
});
