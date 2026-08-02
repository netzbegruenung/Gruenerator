import { describe, expect, it } from 'vitest';

import { buildPrepareStep } from './loopEngine.js';
import { createRecipeRegistry, MAX_RECIPES_PER_TURN } from './recipeRegistry.js';

const recipe = (mention: string, body = 'Schreibe kurz.') => ({
  mention,
  title: `Titel ${mention}`,
  body,
  source: 'system' as const,
});

describe('createRecipeRegistry', () => {
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
