/**
 * `?rezeptId=` names one recipe row. Its short name is the person's own choice
 * and may equal a system recipe's or someone else's, so a lookup that fell back
 * to the short name put a foreign recipe in the chip while the right one was
 * sent.
 */
import { describe, expect, it } from 'vitest';

import { type Mentionable } from '../lib/mentionables';

import { findNotebookRecipe } from './useNotebookRecipeGroups';

const recipe = (type: 'agent' | 'textform', identifier: string, mention: string): Mentionable => ({
  type,
  category: 'skill',
  trigger: '@',
  identifier,
  title: `${type}:${identifier}`,
  description: '',
  avatar: '',
  backgroundColor: '',
  mention,
});

const SYSTEM = recipe('agent', 'gruenerator-oeffentlichkeitsarbeit-nrw', 'presse-nrw');
const MINE = recipe('textform', 'row-1', 'presse-nrw');

describe('findNotebookRecipe', () => {
  it('finds a recipe by id, not by a short name it shares', () => {
    expect(findNotebookRecipe([SYSTEM, MINE], 'presse-nrw', 'row-1')).toBe(MINE);
  });

  it('gives nothing for an unlisted id instead of a namesake', () => {
    // The list is still loading, or the link names someone else's recipe.
    expect(findNotebookRecipe([SYSTEM], 'presse-nrw', 'row-2')).toBeNull();
  });

  it('finds a recipe by short name when the link carries no id', () => {
    expect(findNotebookRecipe([SYSTEM], 'Presse-NRW')).toBe(SYSTEM);
  });
});
