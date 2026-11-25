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
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, getContractsClient } from '../api/index.js';

const OWN_RECIPES_KEY = ['text-forms'];
const PUBLIC_RECIPES_KEY = ['text-forms', 'public'];

/**
 * The chat composer's `@`-mention list of recipes (`useTextformsQuery` in
 * packages/chat, `useMentionablesSync` on mobile). It is a separate cache from
 * `OWN_RECIPES_KEY` — and `['text-forms']` does not prefix-match it — so a
 * mutation that only invalidated the page list left a freshly created recipe
 * missing from `@` until the page was reloaded.
 */
export const MENTION_RECIPES_KEY = ['mention-textforms'] as const;

/** Every list a recipe write changes: the page list and the `@`-mention list. */
function invalidateRecipeLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: OWN_RECIPES_KEY });
  void queryClient.invalidateQueries({ queryKey: MENTION_RECIPES_KEY });
}

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
 * The recipe a share link names (`<titel>-<suffix>` or a uuid), when none of
 * the caller's lists holds it — "Mit Anmeldung" without a Marktplatz listing.
 * The server checks access; 404 resolves to `null`, anything else throws.
 */
export function useRecipeLink(slug: string | null) {
  return useQuery({
    queryKey: ['recipe-link', slug],
    enabled: slug !== null,
    retry: false,
    queryFn: async (): Promise<{
      form: PublicTextForm;
      source: 'own' | 'shared' | 'public';
    } | null> => {
      if (slug === null) return null;
      const res = await getContractsClient().userTextForms.resolveLink({ params: { slug } });
      if (res.status === 200) return { form: res.body.form, source: res.body.source };
      if (res.status === 404) return null;
      throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
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
      // A 200 does not guarantee the field. ts-rest's `validateResponse` is inert
      // with our custom `api`, so a body that misses `styleBlock` arrives
      // unchecked, `undefined` lands in `form.styleBlock` and the editor's next
      // `.trim()` replaces the whole page with the error boundary — instead of
      // the inline line `ExamplesPanel` keeps for exactly this. Empty counts as
      // failed too: the editor rejects an empty style block anyway, so writing
      // one in and reporting success is the same failure with a green label.
      const styleBlock: unknown = res.body.styleBlock;
      if (typeof styleBlock !== 'string' || styleBlock.trim().length === 0)
        throw new ApiError(res.status, 'Die Analyse kam ohne Ergebnis zurück.');
      return styleBlock;
    },
  });
}

/**
 * Synthesize a recipe spec from a one-shot freeform brief. Mirrors
 * `useDraftAgent`.
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

/**
 * „Mit KI erstellen" unter der Beschreibung: der Auslöser-Satz aus Name und
 * Anleitung. Leer zählt als Fehlschlag, wie bei `useAnalyzeRecipe`.
 */
export function useDescribeRecipe() {
  return useMutation({
    mutationFn: async (input: { title: string; styleBlock: string }): Promise<string> => {
      const res = await getContractsClient().userTextForms.describe({ body: input });
      if (res.status !== 200)
        throw new ApiError(res.status, textFormErrorMessage(res.body, res.status));
      const description: unknown = res.body.description;
      if (typeof description !== 'string' || description.trim().length === 0)
        throw new ApiError(res.status, 'Die Beschreibung kam ohne Ergebnis zurück.');
      return description;
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
    onSuccess: () => invalidateRecipeLists(queryClient),
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
    onSuccess: () => invalidateRecipeLists(queryClient),
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
    onSuccess: () => invalidateRecipeLists(queryClient),
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
    onSuccess: () => invalidateRecipeLists(queryClient),
  });
}
