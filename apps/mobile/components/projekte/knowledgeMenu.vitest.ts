import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { describe, expect, it } from 'vitest';

import {
  LANDESVERBAENDE,
  landesverbandRecipeMentions,
  SKILL_SLIMS,
} from '@gruenerator/shared/agents';

import {
  buildKnowledgeActions,
  DISCUSS_ID,
  knowledgeItems,
  landesverbandRecipes,
  recipeItems,
} from './knowledgeMenu';

const shared = { share: { shareId: 's1' } } as Pick<GroupFeedItem, 'share'>;
const unshared = { share: null } as Pick<GroupFeedItem, 'share'>;
const manage = [{ id: 'remove', title: 'Aus dem Projekt entfernen' }];

describe('buildKnowledgeActions', () => {
  it('puts the Austausch entry first', () => {
    expect(buildKnowledgeActions(shared, true, manage).map((a) => a.id)).toEqual([
      DISCUSS_ID,
      'remove',
    ]);
  });
  it('omits it without an Austausch or without a share', () => {
    expect(buildKnowledgeActions(shared, false, manage).map((a) => a.id)).toEqual(['remove']);
    expect(buildKnowledgeActions(unshared, true, manage).map((a) => a.id)).toEqual(['remove']);
  });
});

describe('knowledgeItems / recipeItems', () => {
  const items = [{ kind: 'post' }, { kind: 'doc' }, { kind: 'recipe' }] as GroupFeedItem[];

  it('keeps posts and recipes out of Wissen', () => {
    expect(knowledgeItems(items).map((i) => i.kind)).toEqual(['doc']);
  });

  it('gives recipes their own list', () => {
    expect(recipeItems(items).map((i) => i.kind)).toEqual(['recipe']);
  });
});

describe('landesverbandRecipes', () => {
  // Irgendein Landesverband, der Rezepte mitbringt — die Daten liegen in shared.
  const lv = LANDESVERBAENDE.map((entry) => ({
    id: entry.id,
    mentions: landesverbandRecipeMentions(entry.id),
  })).find((e) => e.mentions.some((m) => SKILL_SLIMS.some((s) => s.mention === m)));

  it('is empty without a Landesverband', () => {
    expect(landesverbandRecipes(null, [])).toEqual([]);
  });

  it('lists the Landesverband recipes with their titles', () => {
    expect(lv).toBeDefined();
    const all = landesverbandRecipes(lv?.id, []);
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) expect(r.title.length).toBeGreaterThan(0);
  });

  it('drops recipes the project already shares', () => {
    const all = landesverbandRecipes(lv?.id, []);
    const first = all[0]?.mention ?? '';
    const rest = landesverbandRecipes(lv?.id, [{ slug: first }]);
    expect(rest.map((r) => r.mention)).not.toContain(first);
    expect(rest).toHaveLength(all.length - 1);
  });
});
