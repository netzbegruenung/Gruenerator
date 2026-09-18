/**
 * Resolves one recipe-detail `:mention` to whatever actually backs it, so
 * `RecipeDetailPage` can stay a dispatcher instead of a four-way lookup.
 *
 * Four sources, checked in that order:
 *  - `system` — a mention in the shipped catalogue (`findSkillByMention`). It
 *    wins over everything: a user's own row on the same mention OVERRIDES that
 *    system recipe's body, it does not replace the page. The row travels along
 *    as `ownOverride` so the page can offer "Angepassten Stil bearbeiten".
 *  - `own`    — the caller's own row (`useOwnRecipes`, no `sharedFromGroup`).
 *  - `shared` — a row that reached them through a Projekt share.
 *  - `public` — a row listed in the open catalogue (`usePublicRecipes`).
 *
 * `status` is 'ready' the moment an answer exists — a system mention never
 * waits on a network round trip, so that page renders exactly as it did before
 * recipes grew their own rows; only the override badge arrives late.
 *
 * `isError` is NOT part of "not found": a failed list must show "konnte nicht
 * geladen werden", never the 404 page, or a transient outage looks like a
 * deleted recipe.
 */
import { type AgentListItem } from '@gruenerator/chat';
import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';

import { findSkillByMention } from '../lib/lookups';

import { useOwnRecipes, usePublicRecipes } from './api';

import { useAuthStore } from '@/stores/authStore';

export type RecipeSource = 'system' | 'own' | 'shared' | 'public';

export interface RecipeLookup {
  status: 'loading' | 'ready';
  source: RecipeSource | null;
  /** Catalogue entry, only for `source: 'system'`. */
  skill: AgentListItem | null;
  /** The row behind an own/shared/public recipe. `null` for a system one. */
  form: TextForm | PublicTextForm | null;
  /** The caller's own row on this mention, whatever the source — for a system
   *  mention that is the override, for `source: 'own'` it is `form` again. */
  ownOverride: TextForm | null;
  /** A list the answer depended on failed to load. */
  isError: boolean;
}

const NOTHING = {
  skill: null,
  form: null,
  ownOverride: null,
  isError: false,
} as const;

export function useRecipeByMention(mention: string): RecipeLookup {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const skill = findSkillByMention(mention);
  const ownQuery = useOwnRecipes(isAuthenticated && mention.length > 0);
  const publicQuery = usePublicRecipes();

  const ownRow = ownQuery.data?.find((f) => f.mention === mention && !f.sharedFromGroup) ?? null;

  if (skill) {
    return {
      status: 'ready',
      source: 'system',
      skill,
      form: null,
      ownOverride: ownRow,
      isError: false,
    };
  }

  if (ownRow) {
    return {
      status: 'ready',
      source: 'own',
      skill: null,
      form: ownRow,
      ownOverride: ownRow,
      isError: false,
    };
  }

  const sharedRow = ownQuery.data?.find((f) => f.mention === mention && f.sharedFromGroup) ?? null;
  if (sharedRow) {
    return {
      status: 'ready',
      source: 'shared',
      skill: null,
      form: sharedRow,
      ownOverride: null,
      isError: false,
    };
  }

  const publicRow = publicQuery.data?.find((f) => f.mention === mention) ?? null;
  if (publicRow) {
    return {
      status: 'ready',
      source: 'public',
      skill: null,
      form: publicRow,
      ownOverride: null,
      isError: false,
    };
  }

  if (ownQuery.isLoading || publicQuery.isLoading) {
    return { status: 'loading', source: null, ...NOTHING };
  }

  return {
    status: 'ready',
    source: null,
    ...NOTHING,
    isError: ownQuery.isError || publicQuery.isError,
  };
}
