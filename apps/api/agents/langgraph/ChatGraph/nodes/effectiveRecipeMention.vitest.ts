/**
 * Welches Rezept einen Turn trägt — Wahl vor Default, und die Wahl gilt auch
 * unter einer eigenen Persona.
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi } from 'vitest';

import { resolveEffectiveRecipeMention } from './effectiveRecipeMention.js';

const AGENT_DEFAULT = 'presse-hessen-partei';

const AGENT_DEFAULT_ID = '11111111-1111-4111-8111-111111111111';

function resolveChoice(overrides: {
  activeSkillMention?: string | null;
  activeRecipeId?: string | null;
  customSystemPrompt?: string | null;
  isWriteEligibleTurn?: boolean;
  agentDefault?: () => string | null;
  agentDefaultRecipeId?: string | null;
}) {
  return resolveEffectiveRecipeMention({
    activeSkillMention: overrides.activeSkillMention ?? null,
    activeRecipeId: overrides.activeRecipeId ?? null,
    customSystemPrompt: overrides.customSystemPrompt ?? null,
    isWriteEligibleTurn: overrides.isWriteEligibleTurn ?? true,
    agentDefault: overrides.agentDefault ?? (() => AGENT_DEFAULT),
    agentDefaultRecipeId: overrides.agentDefaultRecipeId ?? null,
  });
}

/** Die wirksame Mention allein — der Fall, den es vor der id-Wahl nur gab. */
function resolve(overrides: Parameters<typeof resolveChoice>[0]) {
  return resolveChoice(overrides).mention;
}

describe('resolveEffectiveRecipeMention — die ausdrückliche Wahl', () => {
  // Der Befund aus #2928: eine frei getippte Rolle (customSystemPrompt gesetzt,
  // kein Baustein) verwarf die Mention samt Rezepttext, angelernter Textform,
  // Attributionszeile und Logzeile.
  it('gilt unter einer frei getippten Rolle', () => {
    expect(
      resolve({ activeSkillMention: 'presse-hessen-partei', customSystemPrompt: 'Ich bin …' })
    ).toBe('presse-hessen-partei');
  });

  it('gilt unter einer Katalogrolle mit Baustein', () => {
    expect(
      resolve({ activeSkillMention: 'instagram', customSystemPrompt: 'Presse & Social-Media' })
    ).toBe('instagram');
  });

  it('gilt im gewöhnlichen Chat ohne Rolle', () => {
    expect(resolve({ activeSkillMention: 'instagram' })).toBe('instagram');
  });

  it('schlägt den Agenten-Default', () => {
    expect(resolve({ activeSkillMention: 'instagram' })).not.toBe(AGENT_DEFAULT);
  });

  it('gilt auch auf einem Turn, der kein Schreib-Turn ist', () => {
    // Wer „@presse" tippt, bestellt ein Rezept — auch wenn der Klassifikator
    // den Turn für Chitchat hält. Der Schreib-Turn-Filter schützt nur den
    // ungefragten Default vor verschwendeten Tokens.
    expect(resolve({ activeSkillMention: 'presse', isWriteEligibleTurn: false })).toBe('presse');
  });
});

describe('resolveEffectiveRecipeMention — der Agenten-Default', () => {
  it('springt ein, wenn nichts gewählt ist und keine Rolle läuft', () => {
    expect(resolve({})).toBe(AGENT_DEFAULT);
  });

  it('bleibt unter einer frei getippten Rolle aus', () => {
    expect(resolve({ customSystemPrompt: 'Ich bin Sprecher*in des Klimabeirats.' })).toBeNull();
  });

  it('bleibt unter einer Katalogrolle aus', () => {
    expect(resolve({ customSystemPrompt: 'Presse & Social-Media' })).toBeNull();
  });

  it('bleibt auf einem Nicht-Schreib-Turn aus', () => {
    expect(resolve({ isWriteEligibleTurn: false })).toBeNull();
  });

  it('wird gar nicht erst berechnet, wenn eine Mention gewählt ist', () => {
    // Er läuft über SKILLS und die Profilrollen — auf einem Turn mit Wahl ist
    // das reine Arbeit für den Papierkorb.
    const agentDefault = vi.fn(() => AGENT_DEFAULT);
    resolve({ activeSkillMention: 'presse', agentDefault });
    expect(agentDefault).not.toHaveBeenCalled();
  });

  it('wird unter einer Rolle gar nicht erst berechnet', () => {
    const agentDefault = vi.fn(() => AGENT_DEFAULT);
    resolve({ customSystemPrompt: 'Ich bin …', agentDefault });
    expect(agentDefault).not.toHaveBeenCalled();
  });

  it('reicht ein fehlendes Default-Rezept als null durch', () => {
    expect(resolve({ agentDefault: () => null })).toBeNull();
  });
});

/**
 * Die zweite Art zu wählen: die Zeilen-id. Sie ist der stabile Schlüssel — eine
 * Umbenennung der Mention tauscht das Rezept sonst still aus —, und sie zählt
 * wie die Mention als AUSDRÜCKLICHE Wahl. Genau daran hängt, dass der
 * Agenten-Default nicht danebenlegt.
 */
describe('resolveEffectiveRecipeMention — die gewählte Zeile', () => {
  const PINNED = '22222222-2222-4222-8222-222222222222';

  it('gilt allein, auch ohne Mention', () => {
    expect(resolveChoice({ activeRecipeId: PINNED })).toEqual({
      mention: null,
      recipeId: PINNED,
    });
  });

  it('schlägt den Agenten-Default, und der wird nicht einmal berechnet', () => {
    const agentDefault = vi.fn(() => AGENT_DEFAULT);
    const choice = resolveChoice({
      activeRecipeId: PINNED,
      agentDefault,
      agentDefaultRecipeId: AGENT_DEFAULT_ID,
    });
    expect(choice).toEqual({ mention: null, recipeId: PINNED });
    expect(agentDefault).not.toHaveBeenCalled();
  });

  it('reist zusammen mit einer Mention weiter — den Vorrang klärt der Nachschlag', () => {
    expect(resolveChoice({ activeSkillMention: 'presse', activeRecipeId: PINNED })).toEqual({
      mention: 'presse',
      recipeId: PINNED,
    });
  });

  it('gilt auch auf einem Turn, der kein Schreib-Turn ist', () => {
    expect(resolveChoice({ activeRecipeId: PINNED, isWriteEligibleTurn: false })).toEqual({
      mention: null,
      recipeId: PINNED,
    });
  });

  it('bleibt unter einer Rolle bestehen — sie ist eine Bestellung wie die Mention', () => {
    expect(resolveChoice({ activeRecipeId: PINNED, customSystemPrompt: 'Ich bin …' })).toEqual({
      mention: null,
      recipeId: PINNED,
    });
  });
});

describe('resolveEffectiveRecipeMention — das gepinnte Rezept des Agenten', () => {
  it('springt ein, wenn nichts gewählt ist', () => {
    expect(resolveChoice({ agentDefaultRecipeId: AGENT_DEFAULT_ID })).toEqual({
      mention: null,
      recipeId: AGENT_DEFAULT_ID,
    });
  });

  it('schlägt die Default-Mention desselben Agenten', () => {
    // Die id ist der stabile Schlüssel; die Mention bleibt als Rückfall für
    // Agenten, die noch keine id tragen.
    const agentDefault = vi.fn(() => AGENT_DEFAULT);
    const choice = resolveChoice({ agentDefault, agentDefaultRecipeId: AGENT_DEFAULT_ID });
    expect(choice.recipeId).toBe(AGENT_DEFAULT_ID);
    expect(agentDefault).not.toHaveBeenCalled();
  });

  it('bleibt unter einer Rolle aus — wie die Default-Mention', () => {
    expect(
      resolveChoice({ customSystemPrompt: 'Ich bin …', agentDefaultRecipeId: AGENT_DEFAULT_ID })
    ).toEqual({ mention: null, recipeId: null });
  });

  it('bleibt auf einem Nicht-Schreib-Turn aus', () => {
    expect(
      resolveChoice({ isWriteEligibleTurn: false, agentDefaultRecipeId: AGENT_DEFAULT_ID })
    ).toEqual({ mention: null, recipeId: null });
  });
});
