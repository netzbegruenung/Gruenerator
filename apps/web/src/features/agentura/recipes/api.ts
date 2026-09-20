/**
 * React Query hooks for the Agentura recipe data layer ("Rezepte").
 *
 * Wraps the typed ts-rest client (`userTextForms` namespace). Mirrors
 * `agents/api.ts` in shape (one hook per operation, not a bundled object).
 * Successor to the settings tab's `useTextForms.ts`, which is gone along with
 * the tab's editor: every hook here reproduces its behaviour exactly (same
 * query key, same `ApiError` on non-200) plus the two operations that tab
 * never needed: `useDraftRecipe` (the creator's synthesize-from-brief step)
 * and `usePublicRecipes` (the Agentura discovery feed).
 */
import {
  type DraftedRecipeSpec,
  type PublicTextForm,
  type SaveTextFormBody,
  type TextForm,
  type TextFormType,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const OWN_RECIPES_KEY = ['text-forms'];
const PUBLIC_RECIPES_KEY = ['text-forms', 'public'];

/**
 * The server's own sentence, when it sent one. Shared with
 * `useRecipeSharing.ts` so both doors surface the same text: a sharing refusal
 * ("Angepasste System-Rezepte lassen sich nicht teilen …") is the only thing
 * that explains the failure, and a generic `HTTP 409` in its place forces the
 * UI to keep a second, drifting copy of the wording.
 */
export function textFormErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return `HTTP ${status}`;
}

/** Shared by the hook and a future preload, so both hit the same cache entry. */
export const ownRecipesQuery = {
  queryKey: OWN_RECIPES_KEY,
  retry: false,
  queryFn: async (): Promise<TextForm[]> => {
    const res = await getContractsClient().userTextForms.list();
    if (res.status !== 200)
      throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
    return res.body.forms;
  },
};

/** The caller's own recipes, plus any shared into their groups. */
export function useOwnRecipes(enabled: boolean) {
  return useQuery({ ...ownRecipesQuery, enabled });
}

/**
 * Public Agentura discovery feed: recipes listed publicly. `enabled` so callers
 * that can already answer from elsewhere (a system mention is never in this
 * list) don't pay for the round trip.
 */
export function usePublicRecipes(enabled = true) {
  return useQuery({
    queryKey: PUBLIC_RECIPES_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<PublicTextForm[]> => {
      const res = await getContractsClient().userTextForms.listPublic();
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
      return res.body.forms;
    },
  });
}

/**
 * Distill a style block from examples (not persisted). `title` is required by
 * the contract and carried through as-is — the previous `input.title ? … : {}`
 * spread dropped an empty title from the body entirely, so the request arrived
 * with no label at all and the server answered 400.
 */
export function useAnalyzeRecipe() {
  return useMutation({
    mutationFn: async (input: {
      textType?: TextFormType | null;
      title: string;
      examples: Array<{ content: string }>;
    }): Promise<string> => {
      const res = await getContractsClient().userTextForms.analyze({
        body: {
          ...(input.textType ? { textType: input.textType } : {}),
          title: input.title,
          examples: input.examples,
        },
      });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
      return res.body.styleBlock;
    },
  });
}

/**
 * Synthesize a recipe spec from a one-shot freeform brief. Mirrors
 * `useDraftAgent`, minus the conversation-thread variant — the recipe
 * creator only offers the freeform brief.
 */
export function useDraftRecipe() {
  return useMutation({
    mutationFn: async (input: { description: string }): Promise<DraftedRecipeSpec> => {
      const res = await getContractsClient().userTextForms.draft({ body: input });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
      return res.body.spec;
    },
  });
}

/** Create or update a recipe. */
export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mention: string; body: SaveTextFormBody }): Promise<TextForm> => {
      const res = await getContractsClient().userTextForms.save({
        params: { mention: input.mention },
        body: input.body,
      });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
      return res.body.form;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OWN_RECIPES_KEY });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mention: string): Promise<void> => {
      const res = await getContractsClient().userTextForms.remove({ params: { mention } });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OWN_RECIPES_KEY });
    },
  });
}

export function useShareRecipeWithGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mention: string; groupId: string }): Promise<void> => {
      const res = await getContractsClient().userTextForms.share({
        params: { mention: input.mention },
        body: { group_id: input.groupId },
      });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OWN_RECIPES_KEY });
    },
  });
}

export function useUnshareRecipeFromGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mention: string; groupId: string }): Promise<void> => {
      const res = await getContractsClient().userTextForms.unshare({
        params: { mention: input.mention },
        body: { group_id: input.groupId },
      });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OWN_RECIPES_KEY });
    },
  });
}
