import { describe, it, expect } from 'vitest';

import { buildToolUsageBlock } from './agenticRespondService.js';

describe('buildToolUsageBlock', () => {
  const block = buildToolUsageBlock(6);

  it('states the step budget', () => {
    expect(block).toContain('maximal 6 Schritte');
  });

  it('forbids answering factual follow-ups from unverified history (long-thread tool loss)', () => {
    // Regression: "Und die FDP?" after a bundestag turn answered from history
    // with zero tool calls. The prompt must require a fresh tool call.
    expect(block).toMatch(/KEINE belegte Quelle/i);
    expect(block).toMatch(/ERNEUTEN Tool-Aufruf/i);
    expect(block).toContain('Und die FDP?');
  });

  it('no longer blanket-permits skipping tools for "einfache Folgefrage"', () => {
    expect(block).not.toContain('einfache Folgefrage');
  });

  it("omits the artifact-outcome rule by default (split mode's gather phase reuses this block)", () => {
    // Regression: this block is reused verbatim as split mode's gather-phase
    // system prompt (`gatherSystem = toolSystem + GATHER_SUFFIX`), which
    // explicitly forbids writing a final answer/summary in that phase. Without
    // this default, "schließe deine Antwort ... ab" directly contradicted
    // GATHER_SUFFIX's "Schreibe in dieser Phase KEINE finale Antwort" a few
    // lines later in the very same prompt.
    expect(block).not.toMatch(/MEHR ALS EIN Artefakt/);
  });
});

describe('buildToolUsageBlock with includeArtifactOutcomeRule (unified mode)', () => {
  const unifiedBlock = buildToolUsageBlock(6, false, true);

  it('requires one outcome sentence per artifact on a multi-artifact turn', () => {
    // Unified mode has no separate synth step and no buildArtifactNotes note —
    // this is its only channel for "don't leave an attempted artifact unmentioned".
    expect(unifiedBlock).toMatch(/MEHR ALS EIN Artefakt/);
    expect(unifiedBlock).toMatch(/EINEM klaren Satz pro Artefakt/);
    expect(unifiedBlock).toMatch(/Lass kein versuchtes Artefakt unerwähnt/);
  });

  it('asks for one opening sentence naming the whole plan on a multi-artifact turn (unified mode)', () => {
    // Unified mode has no gather phase / GATHER_SUFFIX — this is its only
    // channel for the "name the full plan up front" instruction.
    expect(block).toMatch(/MEHRERE Erstellungen/);
    expect(block).toMatch(/bevor du die Tools aufrufst/);
  });
});

/**
 * Under a research ban the ordinary block says the opposite of the instruction
 * twice over — "Recherchiere ZUERST" and, flattest of all, "beantworte sie
 * NIEMALS ungeprüft aus dem Verlauf", when answering from the transcript is
 * exactly what was asked for. The search tools are already unmounted by then;
 * this stops the prompt from ordering a search into an empty catalog.
 */
describe('buildToolUsageBlock under a research ban', () => {
  const banned = buildToolUsageBlock(6, true);

  it('drops the rule that demands a fresh tool call', () => {
    expect(banned).not.toMatch(/ERNEUTEN Tool-Aufruf/i);
    expect(banned).not.toMatch(/KEINE belegte Quelle/i);
  });

  it('says why there are no search tools, so the model does not apologise for it', () => {
    expect(banned).toMatch(/AUSGESCHLOSSEN/);
    expect(banned).toMatch(/Gesprächsverlauf/);
  });

  it('still forbids inventing what it cannot look up', () => {
    expect(banned).toMatch(/erfinde/i);
  });
});
