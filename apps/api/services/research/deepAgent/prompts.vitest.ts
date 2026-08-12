import { describe, expect, it } from 'vitest';

import { leadPrompt, researcherPrompt } from './prompts.js';

/**
 * Prompt tests pin DECISIONS, not wording — each one below is a behaviour that
 * cost a run when it was absent, and that nothing else in the codebase enforces.
 */
describe('leadPrompt', () => {
  const prompt = leadPrompt('de-DE');

  /**
   * The counterpart to `parallel_tool_calls: true` on the lead: permission to
   * batch is worthless if the plan still says "für JEDE Teilfrage einzeln". Both
   * halves have to agree or delegation stays serial and the run keeps costing
   * the sum of its sub-questions.
   */
  it('tells the lead to delegate every sub-question in one go', () => {
    expect(prompt).toMatch(/auf einmal|gleichzeitig/);
    expect(prompt).not.toMatch(/für JEDE Teilfrage einzeln/);
  });

  it('does not put a ceiling on how many sub-questions a topic may have', () => {
    // Was "4 bis 7". A corridor decides the shape of the research before anyone
    // has looked at the topic.
    expect(prompt).not.toMatch(/4 bis 7/);
    expect(prompt).toMatch(/mindestens drei/);
  });

  it('gives the report a floor but no word ceiling', () => {
    // Was "800 bis 2000 Wörter" — a cap the material regularly exceeded, on a
    // run that had already been paid for.
    expect(prompt).not.toMatch(/bis 2000 Wörter/);
    expect(prompt).toMatch(/mindestens 800 Wörter/);
  });

  it('still pins the mechanics a run dies without', () => {
    expect(prompt).toContain('/bericht.md');
    expect(prompt).toContain('write_todos');
    expect(prompt).toContain('## Quellen');
  });
});

describe('researcherPrompt', () => {
  it('keeps the subagent reading pages rather than trusting the hit list', () => {
    // The longer snippets this change ships make the teaser more useful for
    // CHOOSING what to read — they must not become the source itself.
    expect(researcherPrompt('de-DE')).toContain('seite_lesen');
    expect(researcherPrompt('de-DE')).toMatch(/Wegweiser, keine Quelle/);
  });

  it('does not offer the subagent a tool it no longer has', () => {
    // `tiefen_suche` is lead-only now (see `subagentTools`). A prompt that still
    // names it teaches the worker to call something that is not in its list —
    // which costs a step and reads to the model like a broken tool.
    expect(researcherPrompt('de-DE')).not.toContain('tiefen_suche');
    expect(leadPrompt('de-DE')).toContain('tiefen_suche');
  });

  it('answers in its message instead of writing files', () => {
    // Concurrent `task` calls share one `files` state — three parallel note
    // writes left a single file behind on 10.08.2026.
    expect(researcherPrompt('de-DE')).toMatch(/KEINE Datei/);
  });
});

describe('locale', () => {
  it('carries the Austrian context into both prompts', () => {
    expect(leadPrompt('de-AT')).toContain('ÖSTERREICH');
    expect(researcherPrompt('de-AT')).toContain('ÖSTERREICH');
    expect(leadPrompt('de-DE')).not.toContain('ÖSTERREICH');
  });
});
