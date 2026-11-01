import { describe, expect, it } from 'vitest';

import { buildPrepareStep } from './loopEngine.js';
import {
  createRecipeRegistry,
  MAX_METHOD_RECIPES_PER_TURN,
  MAX_RECIPES_PER_TURN,
  METHOD_ONLY_PRECEDENCE_NOTE,
  METHOD_PRECEDENCE_NOTE,
  TEXT_FORM_REPLACES_FORMAT_RULE,
} from './recipeRegistry.js';

const recipe = (mention: string, body = 'Schreibe kurz.') => ({
  mention,
  title: `Titel ${mention}`,
  body,
  source: 'system' as const,
});

describe('createRecipeRegistry', () => {
  it('lets a chosen recipe replace the preloaded agent default instead of stacking', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('buerger-berlin'), preloaded: true });
    expect(reg.register(recipe('presse-berlin-partei'))).toBe('registered');
    expect(reg.mentions).toEqual(['presse-berlin-partei']);
  });

  it('keeps the preloaded default when the model loads the same recipe again', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('buerger-berlin'), preloaded: true });
    expect(reg.register(recipe('buerger-berlin'))).toBe('duplicate');
    expect(reg.mentions).toEqual(['buerger-berlin']);
  });

  it('renders the recommended tools under the recipe', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('buerger-berlin'), recommendedTools: ['gruenerator_search'] });
    expect(reg.render()).toContain('Für dieses Rezept geeignete Werkzeuge: gruenerator_search.');
  });

  it('renders nothing while empty — the prompt must not gain a stray block', () => {
    expect(createRecipeRegistry().render()).toBe('');
  });

  it('renders the same heading buildSystemMessage uses for a picked recipe', () => {
    const reg = createRecipeRegistry();
    reg.register(recipe('presse', 'Sperrfrist oben.'));
    expect(reg.render()).toContain('## AKTIVE PLATTFORM: Titel presse');
    expect(reg.render()).toContain('Sperrfrist oben.');
  });

  it('is idempotent per mention — a re-called tool must not stack a second block', () => {
    const reg = createRecipeRegistry();
    expect(reg.register(recipe('presse'))).toBe('registered');
    expect(reg.register(recipe('presse'))).toBe('duplicate');
    expect(reg.size).toBe(1);
    expect(reg.render().match(/## AKTIVE PLATTFORM/g)).toHaveLength(1);
  });

  it('refuses past the per-turn cap instead of growing the prompt unbounded', () => {
    const reg = createRecipeRegistry(2);
    expect(reg.register(recipe('a'))).toBe('registered');
    expect(reg.register(recipe('b'))).toBe('registered');
    expect(reg.register(recipe('c'))).toBe('full');
    expect(reg.mentions).toEqual(['a', 'b']);
  });

  it('states the precedence against the profile instructions', () => {
    const reg = createRecipeRegistry();
    reg.register(recipe('instagram'));
    const rendered = reg.render();
    expect(rendered).toContain('FORM');
    expect(rendered).toContain('TON');
  });

  it('stacks a method recipe next to a text form — neither evicts the other', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('bundestagsrecherche'), preloaded: true, rolle: 'methode' });
    reg.register({ ...recipe('buerger-berlin'), preloaded: true });
    expect(reg.register(recipe('presse-berlin-partei'))).toBe('registered');
    // the preloaded TEXTSORTE yields to the chosen one, the method stays
    expect(reg.mentions).toEqual(['bundestagsrecherche', 'presse-berlin-partei']);
  });

  it('renders methods under their own heading, before the text form, with the three-way note', () => {
    const reg = createRecipeRegistry();
    reg.register(recipe('buerger-berlin', 'Mail-Aufbau.'));
    reg.register({ ...recipe('bundestagsrecherche', 'Drucksachen zitieren.'), rolle: 'methode' });
    const out = reg.render();
    expect(out).toContain('## RECHERCHE-METHODE: Titel bundestagsrecherche\nDrucksachen zitieren.');
    expect(out).toContain('## AKTIVE PLATTFORM: Titel buerger-berlin');
    expect(out.indexOf('RECHERCHE-METHODE')).toBeLessThan(out.indexOf('AKTIVE PLATTFORM'));
    expect(out).toContain(METHOD_PRECEDENCE_NOTE);
  });

  // Im Loop steht Regel 2 schon im Systemprompt, bevor ein Rezept geladen ist —
  // mit „**Fettung**". Eine geladene Textsorte muss sie ausdrücklich ablösen.
  it('replaces the generic format rule once a text form is loaded, not for a method alone', () => {
    const form = createRecipeRegistry();
    form.register(recipe('instagram'));
    expect(form.render()).toContain(TEXT_FORM_REPLACES_FORMAT_RULE);

    const method = createRecipeRegistry();
    method.register({ ...recipe('bundestagsrecherche'), rolle: 'methode' });
    expect(method.render()).not.toContain(TEXT_FORM_REPLACES_FORMAT_RULE);
  });

  it('lets the method own the form when no text form is loaded anywhere', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('bundestagsrecherche'), preloaded: true, rolle: 'methode' });
    expect(reg.render()).toContain(METHOD_ONLY_PRECEDENCE_NOTE);
    expect(reg.render()).toContain('Ohne Textsorte bestimmt die Methode auch die Antwortform.');
  });

  it('hands the form back to a text form picked outside the registry', () => {
    const reg = createRecipeRegistry(undefined, undefined, true);
    reg.register({ ...recipe('bundestagsrecherche'), preloaded: true, rolle: 'methode' });
    expect(reg.render()).toContain(METHOD_PRECEDENCE_NOTE);
    expect(reg.render()).not.toContain(METHOD_ONLY_PRECEDENCE_NOTE);
  });

  it('switches to the three-way note once the model loads a text form mid-loop', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('bundestagsrecherche'), preloaded: true, rolle: 'methode' });
    reg.register(recipe('presse'));
    expect(reg.render()).toContain(METHOD_PRECEDENCE_NOTE);
  });

  it('keeps the plain precedence note when no method is loaded', () => {
    const reg = createRecipeRegistry();
    reg.register(recipe('presse'));
    expect(reg.render()).not.toContain('RECHERCHE');
  });

  it('caps methods separately — a full method slot never blocks the text form', () => {
    const reg = createRecipeRegistry();
    for (let i = 0; i < MAX_METHOD_RECIPES_PER_TURN; i++) {
      expect(reg.register({ ...recipe(`m${i}`), rolle: 'methode' })).toBe('registered');
    }
    expect(reg.register({ ...recipe('m-extra'), rolle: 'methode' })).toBe('full');
    expect(reg.register(recipe('presse'))).toBe('registered');
    expect(reg.size).toBe(MAX_METHOD_RECIPES_PER_TURN + 1);
  });

  it('two text forms stay exclusive against preloads: a chosen one evicts the preloaded one', () => {
    const reg = createRecipeRegistry();
    reg.register({ ...recipe('buerger-berlin'), preloaded: true });
    reg.register(recipe('presse'));
    expect(reg.mentions).toEqual(['presse']);
  });

  it('caps at MAX_RECIPES_PER_TURN by default', () => {
    const reg = createRecipeRegistry();
    for (let i = 0; i < MAX_RECIPES_PER_TURN + 3; i++) reg.register(recipe(`r${i}`));
    expect(reg.size).toBe(MAX_RECIPES_PER_TURN);
  });
});

/**
 * Unified mode has no synth phase, so prepareStep is the recipe's ONLY channel.
 * The force-finish branch is the step that WRITES the answer with tools
 * stripped — a recipe missing there is lost exactly where it is needed, and a
 * test that only checks a middle step would stay green through that bug.
 */
describe('buildPrepareStep — recipe block reaches every branch', () => {
  const base = 'BASIS';
  const suffix = '\nFERTIG';
  const block = '\n\n## AKTIVE PLATTFORM: Instagram\nMax 600 Zeichen.';

  it('folds the recipe into the FORCE-FINISH branch (the writing step)', () => {
    const prep = buildPrepareStep(
      base,
      suffix,
      4,
      () => true,
      false,
      () => null,
      () => block
    );
    const out = prep({ stepNumber: 0 });
    expect(out.toolChoice).toBe('none');
    expect(out.system).toContain('Max 600 Zeichen.');
    // …and keeps the finish instruction after it.
    expect(out.system?.indexOf('FERTIG')).toBeGreaterThan(out.system!.indexOf('Max 600'));
  });

  it('folds the recipe into the LAST-STEP branch', () => {
    const prep = buildPrepareStep(
      base,
      suffix,
      3,
      () => false,
      false,
      () => null,
      () => block
    );
    expect(prep({ stepNumber: 2 }).system).toContain('Max 600 Zeichen.');
  });

  it('folds the recipe into the plain branch that previously returned nothing', () => {
    const prep = buildPrepareStep(
      base,
      suffix,
      8,
      () => false,
      false,
      () => null,
      () => block
    );
    const out = prep({ stepNumber: 2 });
    expect(out.system).toContain('Max 600 Zeichen.');
    expect(out.toolChoice).toBeUndefined();
  });

  it('folds the recipe into the forced-tool branch', () => {
    const prep = buildPrepareStep(
      base,
      suffix,
      8,
      () => false,
      false,
      () => 'web_search',
      () => block
    );
    const out = prep({ stepNumber: 1 });
    expect(out.toolChoice).toEqual({ type: 'tool', toolName: 'web_search' });
    expect(out.system).toContain('Max 600 Zeichen.');
  });

  it('reads the block per step — the registry fills up MID-loop', () => {
    let loaded = '';
    const prep = buildPrepareStep(
      base,
      suffix,
      8,
      () => false,
      false,
      () => null,
      () => loaded
    );
    expect(prep({ stepNumber: 1 }).system).toBeUndefined();
    loaded = block;
    expect(prep({ stepNumber: 2 }).system).toContain('Max 600 Zeichen.');
  });

  it('leaves the system untouched when no recipe was loaded', () => {
    const prep = buildPrepareStep(
      base,
      suffix,
      8,
      () => false,
      false,
      () => null,
      () => ''
    );
    expect(prep({ stepNumber: 2 })).toEqual({});

    const finishing = buildPrepareStep(
      base,
      suffix,
      8,
      () => true,
      false,
      () => null,
      () => ''
    );
    expect(finishing({ stepNumber: 0 }).system).toBe(`${base}${suffix}`);
  });
});
