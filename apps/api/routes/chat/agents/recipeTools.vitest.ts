import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecipeRegistry } from '../services/agenticLoop/recipeRegistry.js';

const resolveRecipe = vi.fn();
vi.mock('./recipeCatalog.js', () => ({
  resolveRecipe: (...a: unknown[]) => resolveRecipe(...a),
}));

const { makeRecipeTool } = await import('./recipeTools.js');

const CATALOG = [
  { mention: 'presse', title: 'Pressemitteilung', description: 'PM', source: 'system' as const },
  { mention: 'instagram', title: 'Instagram', description: 'IG', source: 'system' as const },
  { mention: 'reel', title: 'Reel', description: 'Reel', source: 'system' as const },
];

/** The AI SDK types `execute` as optional; every tool here has one. */
async function call(tool: ReturnType<typeof makeRecipeTool>, rezept: string) {
  const execute = tool.execute as (input: { rezept: string }, opts: unknown) => Promise<unknown>;
  return (await execute({ rezept }, {})) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveRecipe.mockResolvedValue({ title: 'Instagram', body: 'Max 600.', source: 'system' });
});

describe('rezept_laden', () => {
  it('registers the recipe and confirms the load', async () => {
    const registry = createRecipeRegistry();
    const out = await call(
      makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' }),
      'instagram'
    );

    expect(out.geladen).toBe(true);
    expect(registry.has('instagram')).toBe(true);
    expect(registry.render()).toContain('Max 600.');
  });

  it('keeps the body OUT of the tool result — it is persisted and streamed in full', async () => {
    const registry = createRecipeRegistry();
    const out = await call(
      makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' }),
      'instagram'
    );

    expect(JSON.stringify(out)).not.toContain('Max 600.');
  });

  /**
   * A missing SKILLS_INTERN_DIR must not read as success. Silent degradation is
   * fine on the single-pass path; as a tool result it would let the model
   * announce "Rezept geladen" and then write generically.
   */
  it('reports failure loudly when no prompt is available', async () => {
    resolveRecipe.mockResolvedValue(null);
    const registry = createRecipeRegistry();
    const out = await call(makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' }), 'presse');

    expect(out.geladen).toBe(false);
    expect(out.grund).toContain('keine Schreibvorgaben');
    expect(registry.size).toBe(0);
  });

  it('is idempotent — a second call does not resolve or stack again', async () => {
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });

    await call(tool, 'instagram');
    const second = await call(tool, 'instagram');

    expect(second.geladen).toBe(true);
    expect(resolveRecipe).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);
  });

  it('refuses past the per-turn cap and names what is already loaded', async () => {
    const registry = createRecipeRegistry(2);
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });

    await call(tool, 'presse');
    await call(tool, 'instagram');
    const third = await call(tool, 'reel');

    expect(third.geladen).toBe(false);
    expect(third.grund).toContain('presse');
    expect(registry.size).toBe(2);
  });

  it('closes the input schema over the catalogue so no unknown recipe can be named', () => {
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });
    const schema = tool.inputSchema as { shape: { rezept: { options: string[] } } };

    expect(schema.shape.rezept.options).toEqual(['presse', 'instagram', 'reel']);
  });
});
