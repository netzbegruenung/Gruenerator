/**
 * Welches Rezept einen Turn trägt — Wahl vor Default, und die Wahl gilt auch
 * unter einer eigenen Persona.
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi } from 'vitest';

import { resolveEffectiveRecipeMention } from './effectiveRecipeMention.js';

const AGENT_DEFAULT = 'presse-hessen-partei';

function resolve(overrides: {
  activeSkillMention?: string | null;
  customSystemPrompt?: string | null;
  isWriteEligibleTurn?: boolean;
  agentDefault?: () => string | null;
}) {
  return resolveEffectiveRecipeMention({
    activeSkillMention: overrides.activeSkillMention ?? null,
    customSystemPrompt: overrides.customSystemPrompt ?? null,
    isWriteEligibleTurn: overrides.isWriteEligibleTurn ?? true,
    agentDefault: overrides.agentDefault ?? (() => AGENT_DEFAULT),
  });
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
