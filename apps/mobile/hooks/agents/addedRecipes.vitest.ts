import { type AgentListItem } from '@gruenerator/chat';
import { type PublicTextForm, type UserLibraryItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { pickAddedRecipes } from './addedRecipes';

const skill = (mention: string, identifier = `gruenerator-${mention}`) =>
  ({ mention, identifier, title: mention }) as AgentListItem;
const form = (id: string) => ({ id, mention: `m-${id}`, title: id }) as PublicTextForm;
const ref = (kind: UserLibraryItem['kind'], r: string): UserLibraryItem => ({
  kind,
  ref: r,
  createdAt: '2026-11-23T00:00:00Z',
});

const lvSkill = skill('pm-berlin', 'gruenerator-oeffentlichkeitsarbeit-berlin');

describe('pickAddedRecipes', () => {
  it('resolves catalog recipes by mention and public recipes by row id, in library order', () => {
    const out = pickAddedRecipes({
      items: [ref('recipe', 'f1'), ref('agent', 'a1'), ref('recipe', 'pressemitteilung')],
      catalogSkills: [skill('pressemitteilung')],
      rolesLoaded: true,
      ownIds: new Set(),
      publicRecipes: [form('f1')],
    });
    expect(out.skills.map((s) => s.mention)).toEqual(['pressemitteilung']);
    expect(out.forms.map((f) => f.id)).toEqual(['f1']);
  });

  it('holds Landesverband recipes back until roles are loaded', () => {
    const input = {
      items: [ref('recipe', 'pm-berlin')],
      catalogSkills: [lvSkill],
      ownIds: new Set<string>(),
      publicRecipes: [],
    };
    expect(pickAddedRecipes({ ...input, rolesLoaded: false }).skills).toEqual([]);
    expect(pickAddedRecipes({ ...input, rolesLoaded: true }).skills).toEqual([lvSkill]);
  });

  it('drops own rows and references that point at nothing visible', () => {
    const out = pickAddedRecipes({
      items: [ref('recipe', 'mine'), ref('recipe', 'gone')],
      catalogSkills: [],
      rolesLoaded: true,
      ownIds: new Set(['mine']),
      publicRecipes: [form('mine')],
    });
    expect(out).toEqual({ skills: [], forms: [] });
  });
});
