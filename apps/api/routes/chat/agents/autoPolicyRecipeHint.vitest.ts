import { describe, expect, it, vi } from 'vitest';

/**
 * Ein Rezept kann unter „Automatisch" eine Lane-Klasse verlangen, wie ein
 * Agent (`autoRoutingHint`); ohne eigenes Feld gilt der Hinweis des Agents,
 * dem es gehört. Heute trägt kein Systemrezept das Feld; der Nachschlag ist
 * deshalb gestellt — geprüft wird die Rangfolge in der Politik.
 */
vi.mock('@gruenerator/shared/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gruenerator/shared/agents')>();
  return {
    ...actual,
    autoRoutingHintForSkillMention: (mention: string) =>
      mention === 'praezises-rezept' ? 'precise' : null,
  };
});

const { resolveAutoSelection } = await import('./autoPolicy.js');

const CREATIVE_AGENT = 'gruenerator-rede-schreiber'; // autoRoutingHint: 'creative'

describe('autoPolicy — Rezept-Hinweis', () => {
  it('ein angeheftetes Rezept mit precise hebt einen Prosa-Turn auf die präzise Lane', () => {
    expect(
      resolveAutoSelection({ intent: 'direct', recipeMention: 'praezises-rezept' }).modelId
    ).toBe('mistral-medium-3.5');
  });

  it('ohne Hinweis bleibt alles beim Alten', () => {
    expect(resolveAutoSelection({ intent: 'direct', recipeMention: 'presse' }).modelId).toBe(
      resolveAutoSelection({ intent: 'direct' }).modelId
    );
  });

  it('ohne eigenen Hinweis gilt der des Agents, dem das Rezept gehört', () => {
    // `@wahlpruefstein` gehört `gruenerator-wahlpruefsteine` (precise) und steht
    // seit 11/2026 vor ihm (#6122) — auf dem Standard-Agenten dieselbe Lane.
    expect(
      resolveAutoSelection({
        intent: 'direct',
        agentId: 'gruenerator-universal',
        recipeMention: 'wahlpruefstein',
      }).modelId
    ).toBe('mistral-medium-3.5');
  });

  it('der Hinweis des Agents gewinnt vor dem des Rezepts', () => {
    expect(
      resolveAutoSelection({
        intent: 'direct',
        agentId: CREATIVE_AGENT,
        recipeMention: 'praezises-rezept',
      }).modelId
    ).toBe(resolveAutoSelection({ intent: 'direct' }).modelId);
  });

  it('wirkt nicht auf Intents mit eigener Aufgabenform', () => {
    expect(
      resolveAutoSelection({ intent: 'create_sheet', recipeMention: 'praezises-rezept' }).modelId
    ).toBe(resolveAutoSelection({ intent: 'create_sheet' }).modelId);
  });
});
