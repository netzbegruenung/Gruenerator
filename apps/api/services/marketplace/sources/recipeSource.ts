/**
 * Rezepte: der offizielle Katalog (über `selectOfficialCatalog`) und die
 * öffentlichen Nutzer-Rezepte des eigenen Landes. `ref` ist die Mention eines
 * Katalog-Rezepts bzw. die Zeilen-uuid eines Nutzer-Rezepts — dieselben
 * Verweise wie in „Meine Grüneratoren".
 *
 * Katalog-Rezepte stehen nur in der Liste, wenn `query.systemRecipes` gilt
 * (siehe `showsSystemRecipes`): der Grünerator wendet sie von selbst an.
 * Liken, Merken und `isVisible` kennen sie immer.
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { SKILL_CATEGORY_ORDER, landesverbandRegion, type Skill } from '@gruenerator/shared/agents';

import {
  listPublicTextFormListings,
  type PublicTextFormListing,
} from '../../user/textFormRepository.js';
import { type MarketplaceContext } from '../context.js';

import { findCandidate, pageCandidates, type Candidate } from './inMemory.js';
import { librarySave } from './librarySave.js';

import type { MarketplaceSource } from './types.js';

type RecipeItem = MarketplaceItemOf<'recipe'>;

function officialItem(skill: Skill, origin: 'offiziell' | 'landesverband'): RecipeItem {
  return {
    kind: 'recipe',
    key: `recipe:${skill.mention}`,
    ref: skill.mention,
    origin,
    title: skill.title,
    description: skill.description || null,
    thumbnailUrl: null,
    iconKey: skill.iconKey || null,
    authorName: null,
    audience: skill.audience ?? 'all',
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: false,
    reportKind: null,
    createdAt: null,
    recipe: {
      mention: skill.mention,
      rowId: null,
      skillCategory: skill.skillCategory ?? 'sonstiges',
      system: true,
    },
  };
}

function publicItem(ctx: MarketplaceContext, listing: PublicTextFormListing): RecipeItem {
  const { form } = listing;
  return {
    kind: 'recipe',
    key: `recipe:${form.id}`,
    ref: form.id,
    origin: 'oeffentlich',
    title: form.title,
    description: form.description,
    thumbnailUrl: null,
    iconKey: form.iconKey,
    authorName: form.ownerName,
    audience: listing.audience,
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: listing.userId === ctx.userId,
    reportKind: 'user_text_form',
    createdAt: listing.createdAt.toISOString(),
    recipe: { mention: form.mention, rowId: form.id, skillCategory: null, system: false },
  };
}

/** Category shelves in Agentura order, registry order within each. */
function categoryRank(skill: Skill): number {
  const index = SKILL_CATEGORY_ORDER.indexOf(skill.skillCategory ?? 'sonstiges');
  return index === -1 ? SKILL_CATEGORY_ORDER.length : index;
}

/**
 * `forList` drops the public recipes the viewer already gets through a project
 * (#4699). `isVisible` passes false: like and save must keep working for them.
 */
async function candidates(
  ctx: MarketplaceContext,
  systemRecipes: boolean,
  forList: boolean
): Promise<Candidate<'recipe'>[]> {
  const [catalog, listings] = await Promise.all([
    // Discovery follows the assignment, resolution does not (`resolvableCatalog`).
    forList ? ctx.officialCatalog() : ctx.resolvableCatalog(),
    listPublicTextFormListings(ctx.audience, forList ? ctx.userId : null),
  ]);
  const general = catalog.generalSkills
    .map((skill, index) => ({ skill, index }))
    .sort((a, b) => categoryRank(a.skill) - categoryRank(b.skill) || a.index - b.index)
    .map(({ skill }) => skill);
  const lv = [...catalog.lvSkills].sort((a, b) =>
    landesverbandRegion(a.identifier).localeCompare(landesverbandRegion(b.identifier))
  );
  const official: Candidate<'recipe'>[] = systemRecipes
    ? [
        ...general.map((s, rank) => ({
          item: officialItem(s, 'offiziell'),
          rank,
          searchText: [s.mention],
        })),
        ...lv.map((s, rank) => ({
          item: officialItem(s, 'landesverband'),
          rank,
          searchText: [s.mention],
        })),
      ]
    : [];
  return [
    ...official,
    ...listings.map((l) => ({
      item: publicItem(ctx, l),
      rank: null,
      searchText: [l.form.mention],
    })),
  ];
}

export const recipeSource: MarketplaceSource<'recipe'> = {
  kind: 'recipe',
  likeType: 'recipe',
  reportKind: 'user_text_form',
  async list(ctx, query) {
    return pageCandidates(
      ctx,
      recipeSource,
      query,
      await candidates(ctx, query.systemRecipes, true)
    );
  },
  async isVisible(ctx, ref) {
    return (await candidates(ctx, true, false)).some((c) => c.item.ref === ref);
  },
  async get(ctx, ref) {
    return findCandidate(ctx, recipeSource, await candidates(ctx, true, false), ref);
  },
  save: librarySave('recipe'),
};
