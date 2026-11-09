import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecipeRegistry } from '../services/agenticLoop/recipeRegistry.js';

import { type RecipeCatalogEntry } from './recipeCatalog.js';

const resolveRecipe = vi.fn();
vi.mock('./recipeCatalog.js', () => ({
  resolveRecipe: (...a: unknown[]) => resolveRecipe(...a),
}));

const { makeRecipeTool, methodEntries } = await import('./recipeTools.js');

const CATALOG: RecipeCatalogEntry[] = [
  {
    key: 'presse',
    mention: 'presse',
    title: 'Pressemitteilung',
    description: 'PM',
    source: 'system',
    origin: 'system',
    id: null,
    ownerName: null,
  },
  {
    key: 'instagram',
    mention: 'instagram',
    title: 'Instagram',
    description: 'IG',
    source: 'system',
    origin: 'system',
    id: null,
    ownerName: null,
  },
  {
    key: 'reel',
    mention: 'reel',
    title: 'Reel',
    description: 'Reel',
    source: 'system',
    origin: 'system',
    id: null,
    ownerName: null,
  },
];

/** The AI SDK types `execute` as optional; every tool here has one. */
async function call(tool: ReturnType<typeof makeRecipeTool>, rezept: string) {
  const execute = tool.execute as (input: { rezept: string }, opts: unknown) => Promise<unknown>;
  return (await execute({ rezept }, {})) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveRecipe.mockResolvedValue({
    id: null,
    mention: 'instagram',
    title: 'Instagram',
    body: 'Max 600.',
    source: 'system',
  });
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
    expect(third.grund).toContain('Mehr als 3 gehen nicht');
    expect(registry.size).toBe(2);
  });

  it('refuses a recipe that no longer fits the turn budget', async () => {
    const registry = createRecipeRegistry(3, 20);
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });
    resolveRecipe.mockResolvedValue({
      id: null,
      mention: 'presse',
      title: 'Pressemitteilung',
      body: 'x'.repeat(21),
      source: 'system',
    });

    const result = await call(tool, 'presse');

    expect(result.geladen).toBe(false);
    expect(result.grund).toBe('Das Rezept passt nicht mehr ins Budget dieses Turns.');
    expect(registry.size).toBe(0);
  });

  /**
   * Der LV-Vorzug: wählt das Modell die generische Zeile, obwohl die Person
   * genau einen Landesverband vertritt, lädt das Tool deterministisch dessen
   * Variante — samt ehrlicher Rückmeldung, WAS geladen wurde.
   */
  it('loads the Landesverband variant when preferLv redirects a generic pick', async () => {
    resolveRecipe.mockResolvedValue({ title: 'PM Hessen (Partei)', body: 'LV.', source: 'system' });
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({
      catalog: CATALOG,
      registry,
      userId: 'u1',
      preferLv: (m) => (m === 'presse' ? 'presse-hessen-partei' : null),
    });

    const out = await call(tool, 'presse');

    expect(resolveRecipe).toHaveBeenCalledWith({
      mention: 'presse-hessen-partei',
      recipeId: null,
      userId: 'u1',
    });
    expect(out.geladen).toBe(true);
    expect(out.rezept).toBe('presse-hessen-partei');
    expect(out.hinweis).toContain('Landesverbands-Variante');
    expect(registry.has('presse-hessen-partei')).toBe(true);
    expect(registry.has('presse')).toBe(false);
  });

  it('stays idempotent across the redirect — a second generic pick does not stack', async () => {
    resolveRecipe.mockResolvedValue({ title: 'PM Hessen (Partei)', body: 'LV.', source: 'system' });
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({
      catalog: CATALOG,
      registry,
      userId: 'u1',
      preferLv: (m) => (m === 'presse' ? 'presse-hessen-partei' : null),
    });

    await call(tool, 'presse');
    const second = await call(tool, 'presse');

    expect(second.geladen).toBe(true);
    expect(resolveRecipe).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);
  });

  it('exposes what was loaded for the turn attribution (summaries)', async () => {
    const registry = createRecipeRegistry();
    await call(makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' }), 'instagram');

    expect(registry.summaries()).toEqual([
      { mention: 'instagram', title: 'Instagram', source: 'system' },
    ]);
    // Der Prompttext bleibt drin (render), aber nie in der Attribution.
    expect(JSON.stringify(registry.summaries())).not.toContain('Max 600.');
  });

  it('describes recipes as procedures, not only text formats', () => {
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });
    expect(tool.description).not.toContain('NICHT für Recherche');
    expect(tool.description).toContain('Recherche-Methode');
  });

  describe('saved recipes', () => {
    const LIB_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
    const LIB_KEY = 'presse-aaaaaa';
    const LIB_CATALOG: RecipeCatalogEntry[] = [
      ...CATALOG,
      {
        key: LIB_KEY,
        mention: 'presse',
        title: 'Presse von Jamila',
        description: 'PM',
        source: 'user',
        origin: 'library',
        id: LIB_ID,
        ownerName: 'Jamila',
      },
    ];

    it('loads a library recipe by key with its id', async () => {
      resolveRecipe.mockResolvedValue({
        id: LIB_ID,
        mention: 'presse',
        title: 'Presse von Jamila',
        body: 'Fremder Stil.',
        source: 'user',
      });
      const registry = createRecipeRegistry();
      const tool = makeRecipeTool({ catalog: LIB_CATALOG, registry, userId: 'u1' });

      const out = await call(tool, LIB_KEY);

      expect(resolveRecipe).toHaveBeenCalledWith({
        mention: 'presse',
        recipeId: LIB_ID,
        userId: 'u1',
      });
      expect(out.geladen).toBe(true);
      expect(registry.has(LIB_ID)).toBe(true);
      // Ein zweiter Aufruf schlägt nicht an die Systemzeile `presse` an.
      expect((await call(tool, LIB_KEY)).hinweis).toContain('bereits geladen');
      expect(resolveRecipe).toHaveBeenCalledTimes(1);
    });

    it('answers geladen:false when a saved recipe is no longer visible', async () => {
      // `resolveRecipeBody` fällt dann auf die Mention zurück: hier das Systemrezept.
      resolveRecipe.mockResolvedValue({
        id: null,
        mention: 'presse',
        title: 'Pressemitteilung',
        body: 'System.',
        source: 'system',
      });
      const registry = createRecipeRegistry();
      const out = await call(
        makeRecipeTool({ catalog: LIB_CATALOG, registry, userId: 'u1' }),
        LIB_KEY
      );

      expect(out.geladen).toBe(false);
      expect(registry.size).toBe(0);
    });
  });

  it('closes the input schema over the catalogue so no unknown recipe can be named', () => {
    const registry = createRecipeRegistry();
    const tool = makeRecipeTool({ catalog: CATALOG, registry, userId: 'u1' });
    const schema = tool.inputSchema as unknown as { shape: { rezept: { options: string[] } } };

    expect(schema.shape.rezept.options).toEqual(['presse', 'instagram', 'reel']);
  });
});

describe('methode_laden', () => {
  const METHOD: RecipeCatalogEntry = {
    key: 'rechtsstand',
    mention: 'rechtsstand',
    title: 'Rechtsstand',
    description: 'Recherche',
    source: 'system',
    origin: 'system',
    id: null,
    ownerName: null,
  };
  const mixed = [...CATALOG, METHOD];

  it('keeps only method recipes of the catalogue', () => {
    expect(methodEntries(mixed).map((e) => e.key)).toEqual(['rechtsstand']);
  });

  it('keeps text forms out of research turns (#3880)', () => {
    const t = makeRecipeTool({
      catalog: mixed,
      registry: createRecipeRegistry(),
      userId: 'u1',
      only: 'methode',
    });
    const schema = t.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ rezept: 'rechtsstand' }).success).toBe(true);
    expect(schema.safeParse({ rezept: 'presse' }).success).toBe(false);
  });

  it('loads a method into the shared registry with its role', async () => {
    resolveRecipe.mockResolvedValue({
      id: null,
      mention: 'rechtsstand',
      title: 'Rechtsstand',
      body: 'Erst das Gesetz.',
      source: 'system',
    });
    const registry = createRecipeRegistry();
    const out = await call(
      makeRecipeTool({ catalog: mixed, registry, userId: 'u1', only: 'methode' }),
      'rechtsstand'
    );
    expect(out.geladen).toBe(true);
    expect(registry.mentions).toEqual(['rechtsstand']);
  });

  it('says a method describes how to research, not how to write', async () => {
    resolveRecipe.mockResolvedValue({
      id: null,
      mention: 'rechtsstand',
      title: 'Rechtsstand',
      body: 'Erst das Gesetz.',
      source: 'system',
    });
    const out = await call(
      makeRecipeTool({
        catalog: mixed,
        registry: createRecipeRegistry(),
        userId: 'u1',
        only: 'methode',
      }),
      'rechtsstand'
    );
    expect(String(out.hinweis)).toContain('recherchierst');
    expect(String(out.hinweis)).not.toContain('Schreiben');
  });

  it('treats the same key as a duplicate across rezept_laden and methode_laden', async () => {
    resolveRecipe.mockResolvedValue({
      id: null,
      mention: 'rechtsstand',
      title: 'Rechtsstand',
      body: 'Erst das Gesetz.',
      source: 'system',
    });
    const registry = createRecipeRegistry();
    const general = makeRecipeTool({ catalog: mixed, registry, userId: 'u1' });
    const method = makeRecipeTool({ catalog: mixed, registry, userId: 'u1', only: 'methode' });
    expect((await call(general, 'rechtsstand')).geladen).toBe(true);
    const again = await call(method, 'rechtsstand');
    expect(again.geladen).toBe(true);
    expect(String(again.hinweis)).toContain('bereits geladen');
    expect(registry.size).toBe(1);
  });

  it('shares the cap of three recipes across both tools', async () => {
    const registry = createRecipeRegistry();
    const extra = ['beschlusslage', 'bundestagsrecherche'].map((k) => ({
      ...METHOD,
      key: k,
      mention: k,
    }));
    const catalog = [...mixed, ...extra];
    const general = makeRecipeTool({ catalog, registry, userId: 'u1' });
    const method = makeRecipeTool({ catalog, registry, userId: 'u1', only: 'methode' });
    for (const [tool, key] of [
      [general, 'presse'],
      [method, 'rechtsstand'],
      [general, 'beschlusslage'],
    ] as const) {
      resolveRecipe.mockResolvedValueOnce({
        id: null,
        mention: key,
        title: key,
        body: 'x',
        source: 'system',
      });
      expect((await call(tool, key)).geladen).toBe(true);
    }
    resolveRecipe.mockResolvedValueOnce({
      id: null,
      mention: 'bundestagsrecherche',
      title: 'b',
      body: 'x',
      source: 'system',
    });
    const fourth = await call(method, 'bundestagsrecherche');
    expect(fourth.geladen).toBe(false);
    expect(String(fourth.grund)).toContain('bereits');
  });
});
