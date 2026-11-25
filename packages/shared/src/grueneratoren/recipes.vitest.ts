import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn<(arg: { queryKey: readonly unknown[] }) => void>();
let lastMutationOptions: { onSuccess?: () => void } | null = null;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useMutation: (options: { onSuccess?: () => void }) => {
    lastMutationOptions = options;
    return options;
  },
  useQuery: () => ({}),
}));

const {
  MENTION_RECIPES_KEY,
  useDeleteRecipe,
  useSaveRecipe,
  useShareRecipeWithGroup,
  useUnshareRecipeFromGroup,
} = await import('./recipes.js');

// Ein Rezept, das im Projekt per „+ Rezept" angelegt wurde, tauchte im
// Composer erst nach einem Neuladen unter `@` auf: die Mutationen
// invalidierten nur die Seitenliste `['text-forms']`, nicht den eigenen
// Cache des Mention-Menüs.
describe('recipe writes refresh the @-mention list', () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    lastMutationOptions = null;
  });

  it.each([
    ['useSaveRecipe', useSaveRecipe],
    ['useDeleteRecipe', useDeleteRecipe],
    ['useShareRecipeWithGroup', useShareRecipeWithGroup],
    ['useUnshareRecipeFromGroup', useUnshareRecipeFromGroup],
  ])('%s invalidates the page list and the mention list', (_name, hook) => {
    hook();
    lastMutationOptions?.onSuccess?.();
    const keys = invalidateQueries.mock.calls.map(([arg]) => arg.queryKey);
    expect(keys).toContainEqual(['text-forms']);
    expect(keys).toContainEqual(MENTION_RECIPES_KEY);
  });
});
