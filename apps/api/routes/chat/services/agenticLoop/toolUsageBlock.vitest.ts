import { describe, it, expect } from 'vitest';

import { materialDominatesTurn } from './agenticRespondService.js';
import { buildToolUsageBlock } from './toolUsageBlock.js';

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

  it("omits the artifact-outcome rules by default (split mode's gather phase reuses this block)", () => {
    // Regression: this block is reused verbatim as split mode's gather-phase
    // system prompt (`gatherSystem = toolSystem + GATHER_SUFFIX`). The closing
    // rule ("schließe deine Antwort ... ab") directly contradicted
    // GATHER_SUFFIX's "Schreibe in dieser Phase KEINE finale Antwort" a few
    // lines later in the same prompt; the opening-plan rule merely duplicated
    // GATHER_SUFFIX's own identical instruction. Both must stay opt-in.
    expect(block).not.toMatch(/MEHR ALS EIN Artefakt/);
    expect(block).not.toMatch(/MEHRERE Erstellungen/);
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

  it('asks for one opening sentence naming the whole plan on a multi-artifact turn', () => {
    // Unified mode has no gather phase / GATHER_SUFFIX — this is its only
    // channel for the "name the full plan up front" instruction.
    expect(unifiedBlock).toMatch(/MEHRERE Erstellungen/);
    expect(unifiedBlock).toMatch(/bevor du die Tools aufrufst/);
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

describe('buildToolUsageBlock — gated on the mounted toolset', () => {
  // Live 13.08.2026 22:12: a turn with `steps=0` (pasted text, no tool call at
  // all) still carried ~1.350 chars of search rules and ~600 of artifact rules,
  // on top of 19 tool schemata. None of it was actionable.
  const SEARCHLESS = ['expand_attachment', 'summarize', 'read_artifact', 'rezept_laden'];
  const WITH_SEARCH = [...SEARCHLESS, 'gruenerator_search', 'web_search'];

  it('drops the search rules when no search tool is mounted', () => {
    const block = buildToolUsageBlock(6, false, false, SEARCHLESS);
    expect(block).not.toMatch(/interne Dokumentsuche/);
    expect(block).not.toMatch(/SUCHEN BAUEN AUFEINANDER AUF/);
    expect(block).not.toMatch(/KEINE belegte Quelle/);
    expect(block).not.toMatch(/\[N\]-Markern/);
  });

  it('keeps them as soon as one search tool is there', () => {
    const block = buildToolUsageBlock(6, false, false, WITH_SEARCH);
    expect(block).toMatch(/interne Dokumentsuche/);
    expect(block).toMatch(/KEINE belegte Quelle/);
  });

  it('ties the web_search scope rule to web_search itself', () => {
    expect(buildToolUsageBlock(6, false, false, ['gruenerator_search'])).not.toMatch(
      /SCOPE GEHÖRT IN DIE PARAMETER/
    );
    expect(buildToolUsageBlock(6, false, false, ['web_search'])).toMatch(
      /SCOPE GEHÖRT IN DIE PARAMETER/
    );
  });

  it('drops the artifact rules when nothing can create an artifact', () => {
    expect(buildToolUsageBlock(6, false, true, SEARCHLESS)).not.toMatch(/MEHR ALS EIN Artefakt/);
    expect(buildToolUsageBlock(6, false, true, [...SEARCHLESS, 'create_board'])).toMatch(
      /MEHR ALS EIN Artefakt/
    );
  });

  it('keeps every rule when the caller does not know the toolset', () => {
    // Omitting the list must never silently lose guidance.
    const block = buildToolUsageBlock(6, false, true);
    expect(block).toMatch(/interne Dokumentsuche/);
    expect(block).toMatch(/SCOPE GEHÖRT IN DIE PARAMETER/);
    expect(block).toMatch(/MEHR ALS EIN Artefakt/);
  });

  it('no longer advertises tools that are not mounted', () => {
    // The dropped inventory sentence named DIP and abgeordnetenwatch; neither
    // was among the 19 tools of the live turn. It duplicated the schemata and
    // invited calls to tools that did not exist.
    const block = buildToolUsageBlock(6, false, true, WITH_SEARCH);
    expect(block).not.toMatch(/abgeordnetenwatch/);
    expect(block).not.toMatch(/\(DIP\)/);
  });

  it('saves real length on a tool-less turn', () => {
    const full = buildToolUsageBlock(8, false, true);
    const lean = buildToolUsageBlock(8, false, true, SEARCHLESS);
    expect(full.length - lean.length).toBeGreaterThan(1800);
  });
});

describe('materialDominatesTurn — when the writer gives up the tool catalog', () => {
  // The live system prompt of 13.08.2026, 22:12 measured 3.164 chars before
  // the tool block was appended.
  const SYSTEM = 'x'.repeat(3164);

  it('an ordinary question stays on the unified path', () => {
    expect(materialDominatesTurn('Was fordern die Grünen zum Hitzeschutz?', SYSTEM)).toBe(false);
    expect(materialDominatesTurn('x'.repeat(3000), SYSTEM)).toBe(false);
  });

  it('the pasted article that looped four times does not', () => {
    // 11.191 chars of pasted text plus rules — the turn is material, not a
    // question, and every unified run of it degenerated.
    expect(materialDominatesTurn('x'.repeat(11_191), SYSTEM)).toBe(true);
  });

  it('moves with the prompt instead of standing on a tuned constant', () => {
    // Same material, a system prompt that grew past it → no longer dominant.
    // This is the point of comparing the two rather than picking a number.
    const material = 'x'.repeat(5000);
    expect(materialDominatesTurn(material, 'x'.repeat(4000))).toBe(true);
    expect(materialDominatesTurn(material, 'x'.repeat(6000))).toBe(false);
  });

  it('is not tripped by an empty turn', () => {
    expect(materialDominatesTurn('', SYSTEM)).toBe(false);
  });

  describe('a document carried into the system message', () => {
    // Measured 13.08.2026 07:23-07:24: the article is persisted and re-injected
    // as FRÜHERE DOKUMENTE, so `base` grows 3.414 → 14.554 while the follow-up
    // asking to CHECK that article is only 712 chars.
    const GROWN = 'x'.repeat(14_554);
    const DOCUMENT = 10_149;

    it('keeps the check turn off the unified path', () => {
      expect(materialDominatesTurn('x'.repeat(712), GROWN, DOCUMENT)).toBe(true);
    });

    it('without counting it, the same turn would go unified', () => {
      // The regression this guards: fixing the missing context re-arms the loop.
      expect(materialDominatesTurn('x'.repeat(712), GROWN)).toBe(false);
    });

    it('a small document does not make every question material', () => {
      expect(materialDominatesTurn('Was steht da zum Hitzeschutz?', SYSTEM, 400)).toBe(false);
    });
  });
});
