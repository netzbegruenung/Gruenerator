/**
 * React Query hooks for the recipe (Agentura "Rezepte") sharing endpoints.
 *
 * Wraps the typed ts-rest client (`userTextForms` namespace). Mirrors
 * `useAgentSharing.ts`, minus the audience axis (recipes have no locale, so
 * there's no `useSetRecipeAudience`) and minus a dedicated group-shares list
 * endpoint: a recipe's group shares already travel on `TextForm.sharedWithGroups`
 * in the OWN list, so `useRecipeGroupShares` derives from `useOwnRecipes`
 * instead of a second round trip. Adding/removing a group share itself is
 * `useShareRecipeWithGroup`/`useUnshareRecipeFromGroup` in `api.ts` (PUT/DELETE
 * `:mention/share`) — this file only covers the visibility axis
 * (share_mode / is_public), same method-split as agent sharing.
 */
import {
  type PublicOwnership,
  type TextFormGroupShare,
  type TextFormShareMode,
  type TextFormShareSettings,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOwnRecipes } from './api';

const SHARE_SETTINGS_KEY = (mention: string) => ['recipe', 'share', 'settings', mention];

export function useRecipeShareSettings(mention: string | null) {
  return useQuery({
    queryKey: mention ? SHARE_SETTINGS_KEY(mention) : ['recipe', 'share', 'settings', '_'],
    enabled: !!mention,
    retry: false,
    queryFn: async (): Promise<TextFormShareSettings> => {
      const client = getContractsClient();
      const result = await client.userTextForms.getShareSettings({
        params: { mention: mention as string },
      });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to fetch share settings (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}

/**
 * Groups a recipe is shared with, read off the caller's own recipe list
 * (`TextForm.sharedWithGroups`) rather than a dedicated endpoint. Empty for a
 * mention that isn't the caller's own or hasn't loaded yet.
 */
export function useRecipeGroupShares(mention: string | null): TextFormGroupShare[] {
  const { data } = useOwnRecipes(!!mention);
  if (!mention) return [];
  return data?.find((form) => form.mention === mention)?.sharedWithGroups ?? [];
}

export function useSetRecipeShareMode(mention: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: TextFormShareMode) => {
      const client = getContractsClient();
      const result = await client.userTextForms.setShareMode({
        params: { mention },
        body: { mode },
      });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to set share mode (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(mention) });
    },
  });
}

export function useSetRecipeIsPublic(mention: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { is_public: boolean; public_ownership: PublicOwnership | null }) => {
      const client = getContractsClient();
      const result = await client.userTextForms.setIsPublic({
        params: { mention },
        body: input,
      });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to set Agentura listing (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(mention) });
      void qc.invalidateQueries({ queryKey: ['text-forms', 'public'] });
    },
  });
}
