import { describe, expect, it } from 'vitest';

import { leadPrompt, programmeResearcherPrompt, webResearcherPrompt } from './prompts.js';

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

describe('webResearcherPrompt', () => {
  const prompt = webResearcherPrompt('de-DE');

  it('keeps the subagent reading pages rather than trusting the hit list', () => {
    // The longer snippets make the teaser more useful for CHOOSING what to
    // read — they must not become the source itself.
    expect(prompt).toContain('seite_lesen');
    expect(prompt).toMatch(/Wegweiser, keine Quelle/);
  });

  it('does not offer tools it no longer has', () => {
    // `tiefen_suche` is lead-only, the corpora belong to the other researcher.
    // A prompt naming either teaches the worker to call something absent,
    // which costs a step and reads to the model like a broken tool.
    expect(prompt).not.toContain('tiefen_suche');
    expect(prompt).not.toContain('notizbuch_suche');
    expect(leadPrompt('de-DE')).toContain('tiefen_suche');
  });

  it('sends resolution questions back instead of answering them from the press', () => {
    expect(prompt).toMatch(/Beschlusslage/);
  });

  it('answers in its message instead of writing files', () => {
    // Concurrent `task` calls share one `files` state — three parallel note
    // writes left a single file behind on 10.08.2026.
    expect(prompt).toMatch(/KEINE Datei/);
  });
});

describe('programmeResearcherPrompt', () => {
  const prompt = programmeResearcherPrompt('de-DE');

  it('searches the corpora and nothing else', () => {
    expect(prompt).toContain('notizbuch_suche');
    expect(prompt).not.toContain('web_suche');
  });

  it('names the empty case as a result rather than a reason to improvise', () => {
    // Without a web fallback of its own, this is the ONLY way a programme
    // question reaches the web: the lead re-delegates it. A worker that fills
    // the gap from general knowledge would invent the party's position.
    expect(prompt).toMatch(/nichts, sage das/);
    expect(prompt).toMatch(/Rate nicht/);
  });

  it('owes the same answer shape as the web researcher', () => {
    // The lead parses `## Quellen` out of every task result — the two must not
    // drift apart.
    expect(prompt).toContain('## Quellen');
    expect(prompt).toMatch(/KEINE Datei/);
    expect(prompt).toMatch(/Erfinde nichts/);
  });
});

describe('delegation rules', () => {
  it('offers both specialists when a corpus is in reach', () => {
    const prompt = leadPrompt('de-DE', { hasNotebooks: true });

    expect(prompt).toContain('programm-recherche');
    expect(prompt).toContain('web-recherche');
  });

  it('never names a subagent that was not registered', () => {
    // `programm-recherche` only exists when `notizbuch_suche` does. Naming it
    // anyway costs the lead a failed `task` call and a repair step.
    const prompt = leadPrompt('de-DE', { hasNotebooks: false });

    expect(prompt).not.toContain('programm-recherche');
    expect(prompt).not.toContain('notizbuch_suche');
    expect(prompt).toContain('web-recherche');
  });
});

describe('locale', () => {
  it('carries the Austrian context into both prompts', () => {
    expect(leadPrompt('de-AT')).toContain('ÖSTERREICH');
    expect(webResearcherPrompt('de-AT')).toContain('ÖSTERREICH');
    expect(programmeResearcherPrompt('de-AT')).toContain('ÖSTERREICH');
    expect(leadPrompt('de-DE')).not.toContain('ÖSTERREICH');
  });
});
