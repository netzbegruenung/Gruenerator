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

  it('bounds the follow-up round instead of letting it eat the clock', () => {
    // All three measured runs ended as PARTIAL reports — not on the search
    // budget (12 of 24 searches) but on time: eight delegations, two of them
    // killed mid-flight by the deadline.
    expect(prompt).toMatch(/höchstens DREI Teilfragen/);
    expect(prompt).toMatch(/Teilbericht/);
  });

  it('sends reported gaps back out as sub-questions', () => {
    // The field exists so the lead does not have to infer an open point from
    // prose — the step that got skipped.
    expect(prompt).toContain('`luecken`');
    expect(prompt).toMatch(/weitere Teilfrage/);
  });

  it('makes a shaky sub-result visible in the report', () => {
    expect(prompt).toMatch(/belastbarkeit: gering/);
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

  it('answers into the schema instead of writing files', () => {
    // Concurrent `task` calls share one `files` state — three parallel note
    // writes left a single file behind on 10.08.2026.
    expect(prompt).toMatch(/nicht als Datei/);
    expect(prompt).toContain('`ergebnis`');
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
    // Shared text, so the two roles cannot drift apart in what they hand back.
    expect(prompt).toContain('`quellen`');
    expect(prompt).toContain('`luecken`');
    expect(prompt).toContain('`belastbarkeit`');
    expect(prompt).toMatch(/Erfinde nichts/);
  });

  it('explains what belongs in a field, which the schema cannot say', () => {
    // A schema pins the shape; only the prompt can say that `luecken` must be
    // readable by someone without the worker's context, because the lead
    // re-delegates them verbatim.
    expect(prompt).toMatch(/ohne deinen Kontext/);
  });
});

describe('delegation rules', () => {
  it('routes a historical party position to the corpora, not the web', () => {
    // Measured: "Position der Grünen zur Wehrpflicht im Jahr 2011" went to
    // `web-recherche` — one misroute in eight delegations. A past resolution is
    // still a resolution.
    expect(leadPrompt('de-DE', { hasNotebooks: true })).toMatch(/FRÜHERE Positionen/);
  });

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
