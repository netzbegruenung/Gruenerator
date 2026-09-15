/**
 * `recipes` gegen ein erfundenes Repository — kein Postgres, kein Modellaufruf.
 * Alles kommt über `ctx.deps` herein, wie bei `userAgentTools.vitest.ts`.
 *
 * Die Zuteilung der Systemrezepte (`SKILLS`, `checkRecipeOverride`) bleibt
 * ECHT: sie ist die parteiinterne Grenze, und ein Fake davon bewiese nichts.
 */
import { MAX_TEXT_FORM_EXAMPLES, MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { deriveRecipeMention, makeRecipesTool, type RecipeToolDeps } from './textFormTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { RecipeCatalogEntry } from './recipeCatalog.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { TextForm } from '@gruenerator/contracts';
import type { RoleLandesverbandInput } from '@gruenerator/shared/agents';

type ToolResult = Record<string, unknown>;

const LONG_STYLE = `## STIL: Einladungen\n\n${'Kurz, warm, mit klarer Uhrzeit. '.repeat(80)}`;

function form(over: Partial<TextForm> = {}): TextForm {
  return {
    id: '11',
    kind: 'custom',
    textType: null,
    mention: 'omveinladungen',
    title: 'OV-Einladungen',
    examples: [
      { content: 'Liebe Mitglieder, am Dienstag treffen wir uns um 19 Uhr im Bürgerhaus.' },
      { content: 'Hallo zusammen, nächste Woche Mitgliederversammlung — kommt zahlreich!' },
    ],
    styleBlock: LONG_STYLE,
    model: 'mistral-large-latest',
    analyzedAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    sharedWithGroups: [],
    sharedFromGroup: null,
    ownerName: null,
    ...over,
  };
}

const SYSTEM_CATALOG: RecipeCatalogEntry[] = [
  {
    mention: 'presse',
    title: 'Pressemitteilung',
    description: 'PM im Grünen-Stil',
    source: 'system',
  },
  { mention: 'instagram', title: 'Instagram', description: 'Post mit Hook', source: 'system' },
  { mention: 'wahlpruefstein', title: 'Wahlprüfstein', description: 'Antwort', source: 'system' },
  {
    mention: 'presse-hessen-partei',
    title: 'Pressemitteilung Hessen',
    description: 'PM Grüne Hessen',
    source: 'system',
  },
];

/** Eine Landesgeschäftsstellen-Rolle in Hessen — schaltet `presse-hessen-*` frei. */
const HESSEN_ROLE: RoleLandesverbandInput = {
  ebene: 'Landesverband',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Hessen',
};

interface CtxOptions {
  userId?: string | null;
  forms?: TextForm[];
  catalog?: RecipeCatalogEntry[];
  analysis?: { styleBlock: string; model: string } | Error;
  registry?: SourceRegistry;
  userText?: string;
  /** `undefined` = der State trägt keine Rollen (MCP-Ctx) → `loadUserRoles`. */
  roles?: RoleLandesverbandInput[] | undefined;
  loadedRoles?: RoleLandesverbandInput[];
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const sourceRegistry =
    opts.registry ??
    ({
      note: (title: string, content: string) => notes.push([title, content]),
      register: (results: unknown) => {
        registered.push(results);
        return '[1] Auszug';
      },
    } as unknown as SourceRegistry);
  const sse = { send: () => {} } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
    userLocale: 'de-DE',
    ...('roles' in opts ? { userRoles: opts.roles } : { userRoles: [] }),
  } as unknown as ChatGraphState;

  const forms = opts.forms ?? [form()];
  const analysis = opts.analysis ?? { styleBlock: '## STIL: neu\n\nKnapp.', model: 'test-model' };
  const deps: RecipeToolDeps = {
    listTextForms: vi.fn(async () => forms),
    upsertTextForm: vi.fn(async (_u, input) =>
      form({
        ...input,
        textType: input.textType ?? null,
        model: input.model ?? null,
        analyzedAt: '2026-09-01T12:00:00.000Z',
      })
    ),
    deleteTextForm: vi.fn(async (_u, mention) => forms.some((f) => f.mention === mention)),
    analyzeTextForm: vi.fn(async () => {
      if (analysis instanceof Error) throw analysis;
      return analysis;
    }),
    recipeCatalog: vi.fn(async () => {
      // Wie das echte `buildRecipeCatalog`: eigene Textformen stehen als Zeile
      // im Katalog, Presets/Rezept-Stile nicht (sie sind die Systemzeile).
      const system = opts.catalog ?? SYSTEM_CATALOG;
      const user = forms
        .filter((f) => f.kind === 'custom')
        .map<RecipeCatalogEntry>((f) => ({
          mention: f.mention,
          title: f.title,
          description: f.sharedFromGroup
            ? `Angelernte Textform aus dem Projekt „${f.sharedFromGroup}".`
            : 'Selbst angelernte Textform.',
          source: 'user',
        }));
      return [...system, ...user];
    }),
    loadUserRoles: vi.fn(async () => (opts.loadedRoles ?? []) as never),
  };
  const tool = makeRecipesTool({ state, sse, threadId: 'thread-1', sourceRegistry, deps });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { limit: 40, confirm: false, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, deps };
}

const CREATE_ARGS = {
  action: 'create',
  title: 'Newsletter Intro',
  examples: ['Hallo ihr Lieben, was für eine Woche!', 'Liebe Leute, es gibt Neuigkeiten.'],
};

describe('recipes: list', () => {
  it('refuses without a session', async () => {
    const { run } = makeCtx({ userId: null });
    expect(await run({ action: 'list' })).toMatchObject({
      error: expect.stringMatching(/Sitzung/),
    });
  });

  it('lists system recipes and own text forms as rows with the mention as ref', async () => {
    const { run, registered } = makeCtx();
    const out = (await run({ action: 'list' })) as {
      resultCount: number;
      results: Array<{ title: string; url: string; type: string; ref?: string; snippet?: string }>;
    };
    expect(out.resultCount).toBe(5);
    expect(out.results[0]).toMatchObject({
      title: 'Pressemitteilung',
      url: '/agentura/rezept/presse',
      type: 'Rezept',
      ref: 'presse',
      snippet: 'PM im Grünen-Stil',
    });
    expect(out.results[4]).toMatchObject({
      title: 'OV-Einladungen',
      url: '/settings/texte-anlernen',
      type: 'Eigene Textform',
      ref: 'omveinladungen',
    });
    expect(registered).toHaveLength(1);
  });

  it('marks a system recipe the person has overridden with an own preset or recipe style', async () => {
    const { run } = makeCtx({
      forms: [
        form({
          kind: 'preset',
          mention: 'presse',
          textType: 'presse',
          title: 'Pressemitteilungen',
        }),
        form({
          kind: 'recipe',
          mention: 'presse-hessen-partei',
          textType: 'presse',
          title: 'Pressemitteilung Hessen',
        }),
        // Ein geteilter Presetstil zählt nicht — er ersetzt nur beim Eigentümer.
        form({ kind: 'preset', mention: 'instagram', sharedFromGroup: 'Klima-AG' }),
      ],
    });
    const out = (await run({ action: 'list' })) as {
      results: Array<{ ref?: string; snippet?: string }>;
    };
    const byRef = new Map(out.results.map((r) => [r.ref, r.snippet ?? '']));
    expect(byRef.get('presse')).toContain('eigener Stil hinterlegt („Pressemitteilungen")');
    expect(byRef.get('presse-hessen-partei')).toContain('eigener Stil hinterlegt');
    expect(byRef.get('instagram')).toBe('Post mit Hook');
    expect(byRef.get('wahlpruefstein')).toBe('Antwort');
  });

  it('grounds the empty case as a note pointing to the settings', async () => {
    const { run, notes, registered } = makeCtx({ catalog: [], forms: [] });
    expect(await run({ action: 'list' })).toMatchObject({ resultCount: 0 });
    expect(notes[0][1]).toContain('/settings/texte-anlernen');
    expect(registered).toHaveLength(0);
  });

  it('caps at limit and says so', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'list', limit: 2 });
    expect(out).toMatchObject({ resultCount: 2, note: expect.stringMatching(/ersten 2 von 5/) });
  });
});

describe('recipes: get', () => {
  it('needs a mention', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'get' })).toMatchObject({
      error: expect.stringMatching(/mention/),
    });
  });

  it('returns the own text form with example previews and a shortened style block', async () => {
    const { run, registered } = makeCtx();
    const out = (await run({ action: 'get', mention: '@omveinladungen' })) as {
      recipe: Record<string, unknown>;
    };
    expect(out.recipe).toMatchObject({
      mention: 'omveinladungen',
      title: 'OV-Einladungen',
      source: 'user',
      kind: 'custom',
      kindLabel: 'Eigene Textform',
      overridesSystemRecipe: false,
      exampleCount: 2,
      styleTruncated: true,
      analyzedAt: '2026-08-30T10:00:00.000Z',
      readOnly: false,
      url: '/settings/texte-anlernen',
    });
    expect((out.recipe.styleBlock as string).length).toBeLessThanOrEqual(1500);
    expect(out.recipe.examples).toEqual([
      'Liebe Mitglieder, am Dienstag treffen wir uns um 19 Uhr im Bürgerhaus.',
      'Hallo zusammen, nächste Woche Mitgliederversammlung — kommt zahlreich!',
    ]);
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).toContain('Beispiele: 2 — „Liebe Mitglieder');
    expect(block).toContain('Stilblock (gekürzt): ## STIL: Einladungen');
  });

  it('caps each example preview at ~200 chars and shows at most five', async () => {
    const { run } = makeCtx({
      forms: [
        form({
          examples: Array.from({ length: 7 }, (_, i) => ({ content: `${i} ${'x'.repeat(400)}` })),
        }),
      ],
    });
    const out = (await run({ action: 'get', mention: 'omveinladungen' })) as {
      recipe: { examples: string[]; exampleCount: number };
    };
    expect(out.recipe.exampleCount).toBe(7);
    expect(out.recipe.examples).toHaveLength(5);
    for (const e of out.recipe.examples) expect(e.length).toBeLessThanOrEqual(200);
  });

  it('names the overridden recipe for a preset style', async () => {
    const { run, registered } = makeCtx({
      forms: [form({ kind: 'preset', mention: 'presse', textType: 'presse', title: 'Presse' })],
    });
    const out = (await run({ action: 'get', mention: 'presse' })) as {
      recipe: Record<string, unknown>;
    };
    expect(out.recipe).toMatchObject({
      kind: 'preset',
      overridesSystemRecipe: true,
      textTypeLabel: 'Pressemitteilungen',
    });
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).toContain('ersetzt die Vorgaben von @presse');
  });

  it('shows a shared text form read-only', async () => {
    const { run } = makeCtx({
      forms: [form({ mention: 'kv-mail', sharedFromGroup: 'Klima-AG', ownerName: 'Lena' })],
    });
    const out = (await run({ action: 'get', mention: 'kv-mail' })) as {
      recipe: Record<string, unknown>;
    };
    expect(out.recipe).toMatchObject({ readOnly: true, sharedFromGroup: 'Klima-AG' });
  });

  it('errors on an unknown mention', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'get', mention: 'nix' })).toMatchObject({
      error: expect.stringMatching(/nicht|Kein/),
    });
  });
});

describe('recipes: parteiinterne Grenze — Systemrezepte ohne Rumpf', () => {
  it('get on a system recipe returns title and description, never a body', async () => {
    const { run, registered } = makeCtx();
    const out = (await run({ action: 'get', mention: 'presse' })) as {
      recipe: Record<string, unknown>;
    };
    expect(out.recipe).toEqual({
      mention: 'presse',
      title: 'Pressemitteilung',
      description: 'PM im Grünen-Stil',
      source: 'system',
      readOnly: true,
      note: expect.stringMatching(/rezept_laden/),
      url: '/agentura/rezept/presse',
    });
    expect(out.recipe).not.toHaveProperty('styleBlock');
    expect(out.recipe).not.toHaveProperty('body');
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).toContain('nicht einsehbar');
  });

  it('has no path to the internal prompts: the deps carry only user-scoped functions', () => {
    const { deps } = makeCtx();
    expect(Object.keys(deps).sort()).toEqual([
      'analyzeTextForm',
      'deleteTextForm',
      'listTextForms',
      'loadUserRoles',
      'recipeCatalog',
      'upsertTextForm',
    ]);
  });

  it('add_examples and delete on a system recipe mention without an own form are "nicht gefunden"', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'add_examples', mention: 'presse', examples: ['x'] })).toMatchObject(
      { error: expect.stringMatching(/Keine eigene Textform/) }
    );
    expect(await run({ action: 'delete', mention: 'presse', confirm: true })).toMatchObject({
      error: expect.stringMatching(/Keine eigene Textform/),
    });
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
    expect(deps.deleteTextForm).not.toHaveBeenCalled();
  });
});

describe('recipes: create (direct)', () => {
  it('needs a title and at least one example, and writes nothing without them', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'create', examples: ['x'] })).toMatchObject({
      error: expect.stringMatching(/title/),
    });
    expect(await run({ action: 'create', title: 'Leer', examples: ['  ', ''] })).toMatchObject({
      error: expect.stringMatching(/mindestens einen Beispieltext/),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
  });

  it('derives the mention from the title, analyzes, and stores a custom form', async () => {
    const { run, deps, notes } = makeCtx();
    const out = await run(CREATE_ARGS);
    expect(out).toMatchObject({
      ok: true,
      recipe: {
        mention: 'newsletter-intro',
        title: 'Newsletter Intro',
        kind: 'custom',
        exampleCount: 2,
        overridesSystemRecipe: false,
      },
    });
    expect(deps.analyzeTextForm).toHaveBeenCalledWith('Newsletter Intro', [
      { content: 'Hallo ihr Lieben, was für eine Woche!' },
      { content: 'Liebe Leute, es gibt Neuigkeiten.' },
    ]);
    expect(deps.upsertTextForm).toHaveBeenCalledWith('user-1', {
      kind: 'custom',
      textType: null,
      mention: 'newsletter-intro',
      title: 'Newsletter Intro',
      examples: [
        { content: 'Hallo ihr Lieben, was für eine Woche!' },
        { content: 'Liebe Leute, es gibt Neuigkeiten.' },
      ],
      styleBlock: '## STIL: neu\n\nKnapp.',
      model: 'test-model',
    });
    expect(notes[0][1]).toContain('als @newsletter-intro nutzbar');
  });

  it('keeps umlauts in a derived mention and validates it against the contract', () => {
    expect(deriveRecipeMention('Bürgermail Grüne Höchst')).toBe('bürgermail-grüne-höchst');
    expect(deriveRecipeMention('  OV Einladungen!! ')).toBe('ov-einladungen');
    expect(deriveRecipeMention('x'.repeat(60)).length).toBeLessThanOrEqual(48);
  });

  it('rejects an explicit mention that violates the slug rule', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ ...CREATE_ARGS, mention: 'Mein Stil!' })).toMatchObject({
      error: expect.stringMatching(/Ungültige Mention/),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });

  it('uses the text-type label for the analysis when textType is given', async () => {
    const { run, deps } = makeCtx();
    await run({ ...CREATE_ARGS, textType: 'instagram', mention: 'insta-kv' });
    expect(deps.analyzeTextForm).toHaveBeenCalledWith('Instagram-Posts', expect.any(Array));
    expect(deps.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'custom', textType: 'instagram', mention: 'insta-kv' })
    );
  });

  it('refuses to replace an existing own form and points to add_examples', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ ...CREATE_ARGS, mention: 'omveinladungen' })).toMatchObject({
      error: expect.stringMatching(/gibt es schon.*add_examples/),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });

  it('enforces the example count cap', async () => {
    const { run, deps } = makeCtx();
    const examples = Array.from({ length: MAX_TEXT_FORM_EXAMPLES + 1 }, (_, i) => `Beispiel ${i}`);
    expect(await run({ ...CREATE_ARGS, examples })).toMatchObject({
      error: expect.stringMatching(new RegExp(`Höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele`)),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });

  it('enforces the total character budget', async () => {
    const { run, deps } = makeCtx();
    const half = 'a'.repeat(Math.ceil(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS / 2) + 1);
    expect(await run({ ...CREATE_ARGS, examples: [half, half] })).toMatchObject({
      error: expect.stringMatching(/Zeichen haben/),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });

  it('caps the stored style block at the contract limit', async () => {
    const { run, deps } = makeCtx({
      analysis: { styleBlock: 'y'.repeat(9000), model: 'm' },
    });
    await run(CREATE_ARGS);
    const input = (deps.upsertTextForm as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      styleBlock: string;
    };
    expect(input.styleBlock).toHaveLength(8000);
  });

  it('returns a relayable error and stores nothing when the analysis fails', async () => {
    const { run, deps } = makeCtx({ analysis: new Error('timeout') });
    expect(await run(CREATE_ARGS)).toMatchObject({
      error: expect.stringMatching(/Stilanalyse.*timeout.*nichts gespeichert/),
    });
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
  });

  it('refuses when the message rules out persistent changes', async () => {
    const { run, deps } = makeCtx({
      userText: 'Nichts speichern, keine Aktion — lern meinen Stil aus diesen Texten',
    });
    expect(await run(CREATE_ARGS)).toMatchObject({ error: expect.stringMatching(/schließt/) });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });
});

describe('recipes: create — Überschreiben eines Systemrezepts', () => {
  it('a preset mention becomes kind=preset with textType=mention', async () => {
    const { run, deps, notes } = makeCtx({ forms: [] });
    const out = await run({ ...CREATE_ARGS, title: 'Meine PMs', mention: '@presse' });
    expect(out).toMatchObject({
      ok: true,
      recipe: { kind: 'preset', overridesSystemRecipe: true },
    });
    expect(deps.analyzeTextForm).toHaveBeenCalledWith('Pressemitteilungen', expect.any(Array));
    expect(deps.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'preset', textType: 'presse', mention: 'presse' })
    );
    expect(notes[0][1]).toContain('ersetzt ab jetzt die mitgelieferten Vorgaben');
  });

  it('antrag is a preset without a system recipe: stored as preset, not an override', async () => {
    const { run } = makeCtx({ forms: [] });
    const out = await run({ ...CREATE_ARGS, title: 'Anträge', mention: 'antrag' });
    expect(out).toMatchObject({
      ok: true,
      recipe: { kind: 'preset', overridesSystemRecipe: false },
    });
  });

  it('a Landesverband recipe becomes kind=recipe when the role entitles it', async () => {
    const { run, deps } = makeCtx({ forms: [], roles: [HESSEN_ROLE] });
    const out = await run({
      ...CREATE_ARGS,
      title: 'PM Hessen',
      mention: 'presse-hessen-partei',
      textType: 'presse',
    });
    expect(out).toMatchObject({
      ok: true,
      recipe: { kind: 'recipe', overridesSystemRecipe: true },
    });
    expect(deps.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        kind: 'recipe',
        textType: 'presse',
        mention: 'presse-hessen-partei',
      })
    );
    expect(deps.loadUserRoles).not.toHaveBeenCalled();
  });

  it('a retired alias lands on the living mention', async () => {
    const { run, deps } = makeCtx({ forms: [], roles: [HESSEN_ROLE] });
    await run({ ...CREATE_ARGS, title: 'PM Hessen', mention: 'presse-hessen' });
    expect(deps.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'recipe', mention: 'presse-hessen-partei' })
    );
  });

  it('refuses a foreign Landesverband recipe without touching the model', async () => {
    const { run, deps } = makeCtx({ forms: [], roles: [] });
    expect(await run({ ...CREATE_ARGS, mention: 'presse-hessen-partei' })).toMatchObject({
      error: expect.stringMatching(/keine Rolle hinterlegt.*andere Mention/),
    });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
  });

  it('loads the roles itself when the state carries none (MCP), instead of letting everything through', async () => {
    const { run, deps } = makeCtx({ forms: [], roles: undefined, loadedRoles: [] });
    expect(await run({ ...CREATE_ARGS, mention: 'presse-hessen-partei' })).toMatchObject({
      error: expect.stringMatching(/keine Rolle hinterlegt/),
    });
    expect(deps.loadUserRoles).toHaveBeenCalledWith('user-1');
  });

  it('a system recipe without a Landesverband (wahlpruefstein) cannot be overridden', async () => {
    const { run, deps } = makeCtx({ forms: [] });
    expect(await run({ ...CREATE_ARGS, mention: 'wahlpruefstein' })).toMatchObject({
      error: expect.stringMatching(/kein Rezept eines Landesverbands.*andere Mention/),
    });
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
  });
});

describe('recipes: add_examples (direct, owner-scoped)', () => {
  it('appends, re-analyzes and stores with the form’s own kind, type and title', async () => {
    const { run, deps, notes } = makeCtx();
    const out = await run({
      action: 'add_examples',
      mention: 'omveinladungen',
      examples: ['Liebe Freund*innen, Samstag ist Infostand.', '   '],
    });
    expect(out).toMatchObject({ ok: true, recipe: { mention: 'omveinladungen', exampleCount: 3 } });
    expect(deps.analyzeTextForm).toHaveBeenCalledWith('OV-Einladungen', [
      { content: 'Liebe Mitglieder, am Dienstag treffen wir uns um 19 Uhr im Bürgerhaus.' },
      { content: 'Hallo zusammen, nächste Woche Mitgliederversammlung — kommt zahlreich!' },
      { content: 'Liebe Freund*innen, Samstag ist Infostand.' },
    ]);
    expect(deps.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        kind: 'custom',
        textType: null,
        mention: 'omveinladungen',
        title: 'OV-Einladungen',
        styleBlock: '## STIL: neu\n\nKnapp.',
      })
    );
    expect(notes[0][1]).toContain('1 Beispiel ergänzt, jetzt 3');
  });

  it('counts existing examples against the cap', async () => {
    const { run, deps } = makeCtx({
      forms: [
        form({
          examples: Array.from({ length: MAX_TEXT_FORM_EXAMPLES }, (_, i) => ({ content: `${i}` })),
        }),
      ],
    });
    expect(
      await run({ action: 'add_examples', mention: 'omveinladungen', examples: ['eins mehr'] })
    ).toMatchObject({ error: expect.stringMatching(/Höchstens/) });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });

  it('a shared form is read-only: add_examples is "nicht gefunden"', async () => {
    const { run, deps } = makeCtx({
      forms: [form({ mention: 'kv-mail', sharedFromGroup: 'Klima-AG' })],
    });
    expect(
      await run({ action: 'add_examples', mention: 'kv-mail', examples: ['x'] })
    ).toMatchObject({ error: expect.stringMatching(/Keine eigene Textform/) });
    expect(deps.upsertTextForm).not.toHaveBeenCalled();
  });

  it('refuses when the message rules out changes', async () => {
    const { run, deps } = makeCtx({ userText: 'Keine Aktion, nur erklären.' });
    expect(
      await run({ action: 'add_examples', mention: 'omveinladungen', examples: ['x'] })
    ).toMatchObject({ error: expect.stringMatching(/schließt/) });
    expect(deps.analyzeTextForm).not.toHaveBeenCalled();
  });
});

describe('recipes: delete (two-step)', () => {
  it('asks first', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'delete', mention: 'omveinladungen' })).toMatchObject({
      needsConfirmation: true,
      note: expect.stringMatching(/confirm=true/),
    });
    expect(deps.deleteTextForm).not.toHaveBeenCalled();
  });

  it('deletes with confirm=true', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'delete', mention: 'omveinladungen', confirm: true })).toMatchObject(
      { ok: true, note: expect.stringMatching(/gelöscht/) }
    );
    expect(deps.deleteTextForm).toHaveBeenCalledWith('user-1', 'omveinladungen');
  });

  it('says the system recipe is back in force when a preset style is deleted', async () => {
    const { run } = makeCtx({
      forms: [form({ kind: 'preset', mention: 'presse', textType: 'presse' })],
    });
    expect(await run({ action: 'delete', mention: 'presse', confirm: true })).toMatchObject({
      note: expect.stringMatching(/wieder die mitgelieferten Vorgaben/),
    });
  });

  it('cannot delete a form shared TO the person', async () => {
    const { run, deps } = makeCtx({
      forms: [form({ mention: 'kv-mail', sharedFromGroup: 'Klima-AG' })],
    });
    expect(await run({ action: 'delete', mention: 'kv-mail', confirm: true })).toMatchObject({
      error: expect.stringMatching(/Keine eigene Textform/),
    });
    expect(deps.deleteTextForm).not.toHaveBeenCalled();
  });
});

/**
 * Gegen die ECHTE Registry: wo `renderAll()` den Text hinschreibt und was
 * der Schreiber im split-Modus davon sieht — er liest nur diesen Block.
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  it('puts the recipe list into the citable sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'list' });
    expect(registry.freshSize).toBe(5);
    const block = registry.renderAll();
    expect(block).toContain('Pressemitteilung');
    expect(block).toContain('Eigene Textform — OV-Einladungen');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('puts the text form details into the sources, with the shortened style block', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'get', mention: 'omveinladungen' });
    expect(registry.freshSize).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Stilblock (gekürzt): ## STIL: Einladungen');
    expect(block).toContain('Beispiele: 2');
  });

  it('reports create as a VORGANG, so the writer names the new mention instead of inventing one', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run(CREATE_ARGS);
    expect(registry.freshSize).toBe(0);
    const block = registry.renderAll();
    expect(block).toContain('VORGÄNGE IN DIESEM TURN');
    expect(block).toContain('@newsletter-intro');
  });
});
