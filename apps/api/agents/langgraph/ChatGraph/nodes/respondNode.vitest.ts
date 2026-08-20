import { describe, it, expect, vi } from 'vitest';

import {
  buildSystemMessage,
  formatSearchContext,
  formatTabularComputeGuidance,
  getModeGuidance,
  citableSourcesAvailable,
  truncateDocument,
  limitAttachmentContext,
  formatThreadAttachmentsContext,
} from './respondNode.js';

import type { ChatGraphState, ComputeData, SearchResult, ThreadAttachment } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeResults(n: number): SearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    source: `gruenerator:test-${i}`,
    title: `Result ${i}`,
    content: `Content for result ${i}`.repeat(5),
    relevance: 0.8,
  }));
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'research',
    searchResults: makeResults(4),
    searchQuery: 'wer ist moritz wächter',
    researchBrief: null,
    documentSources: [],
    perSourceResults: {},
    documentChatIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    searchSources: ['web'],
    complexity: 'simple',
    // Default to a run_python-capable client (web) so the pandas-guidance
    // assertions below exercise the historical behavior; capability-less
    // clients (mobile/voice) are covered explicitly.
    clientCanRunPython: true,
    ...overrides,
  } as unknown as ChatGraphState;
}

function makeComputeResult(overrides: Partial<ComputeData> = {}): ComputeData {
  return {
    operation: 'Zeichen zählen',
    entries: [
      { label: 'Zeichen (inkl. Leerzeichen)', value: '591' },
      { label: 'Wörter (durch Leerzeichen getrennt)', value: '100' },
    ],
    summary: '591 Zeichen (inkl. Leerzeichen), 100 Wörter, 1 Zeile.',
    ...overrides,
  };
}

describe('truncateDocument', () => {
  const long = 'A'.repeat(10_000);

  it('returns short text untouched', () => {
    expect(truncateDocument('kurz', 500)).toBe('kurz');
  });

  it('keeps intro and outro at a generous limit', () => {
    const out = truncateDocument(long + 'ZZZ', 2000);
    expect(out.startsWith('AAAA')).toBe(true);
    expect(out.endsWith('ZZZ')).toBe(true);
    expect(out).toContain('Zeichen gekürzt');
  });

  // The arithmetic used to produce outroLength === 0 here, and `slice(-0)` is
  // `slice(0)` — the cap returned the WHOLE text. 150 is exactly the per-chunk
  // floor in formatSourceChunks, so this fired on the multi-chunk path.
  it('caps instead of expanding at the 150-char floor', () => {
    const out = truncateDocument(long, 150);
    expect(out.length).toBeLessThan(300);
    expect(out).not.toBe(long);
  });

  it('caps instead of expanding below the floor', () => {
    for (const limit of [10, 50, 100, 149]) {
      const out = truncateDocument(long, limit);
      expect(out.length, `limit=${limit}`).toBeLessThan(200);
      expect(out, `limit=${limit}`).not.toBe(long);
    }
  });

  it('never returns more than it was given', () => {
    for (const limit of [1, 60, 149, 150, 151, 400, 5000]) {
      expect(truncateDocument(long, limit).length, `limit=${limit}`).toBeLessThan(long.length);
    }
  });
});

describe('limitAttachmentContext — fair per-document split (M1/M3)', () => {
  function doc(name: string, chars: number): string {
    return `### ${name}\n\n${'A'.repeat(chars)}`;
  }

  it('keeps all N documents instead of dropping the last one under budget pressure', () => {
    const context = [doc('A.pdf', 8000), doc('B.pdf', 8000), doc('C.pdf', 8000)].join(
      '\n\n---\n\n'
    );
    // Old first-come-first-served behavior exhausted the budget on A and B,
    // dropping C entirely — the exact failure mode of a 3-file comparison.
    const out = limitAttachmentContext(context, undefined, 10_000);
    expect(out).toContain('A.pdf');
    expect(out).toContain('B.pdf');
    expect(out).toContain('C.pdf');
    expect(out).not.toContain('nicht einbezogen');
  });

  it('names omitted documents instead of only counting them', () => {
    const context = [doc('Real.pdf', 500), '### Empty.pdf\n\n'].join('\n\n---\n\n');
    const out = limitAttachmentContext(context, undefined, 200);
    expect(out).toContain('nicht einbezogen');
    expect(out).toContain('Empty.pdf');
  });

  it('leaves a single document untouched under a generous budget', () => {
    const context = doc('Solo.pdf', 500);
    const out = limitAttachmentContext(context, undefined, 10_000);
    expect(out).toBe(context);
  });

  it('gives every document at least the minimum floor even with many attachments', () => {
    const many = Array.from({ length: 10 }, (_, i) => doc(`F${i}.pdf`, 5000));
    const out = limitAttachmentContext(many.join('\n\n---\n\n'), undefined, 5_000);
    for (let i = 0; i < 10; i++) {
      expect(out).toContain(`F${i}.pdf`);
    }
  });
});

/**
 * Ein Such-Turn, der zugleich eine bestellte Textform schuldet.
 *
 * Live auf beta am 20.08.2026, zwei Turns im selben Thread: `/presse mehr
 * artenschutz in ludwigshafen` kam als Recherche-Briefing zurueck, das
 * mention-lose „schreibe eine pressemitteilung …" danach als korrekte
 * Pressemitteilung. Die ausdrueckliche Wahl war der schwaechere Weg — sie
 * unterdrueckt `rezept_laden` und legt den Rezepttext an den Anfang des
 * System-Prompts, weit vor SEARCH_GUIDANCE.
 */
describe('getModeGuidance — bestellte Textform auf einem Such-Turn', () => {
  it('nennt die gewaehlte Textform und sagt, dass sie das Ergebnis ist', () => {
    const out = getModeGuidance(makeState({ intent: 'search', activeSkillMention: 'presse' }));
    // Der Name kommt aus der Registry, nicht aus einer Tabelle in respondNode.
    expect(out).toContain('Pressemitteilung');
    expect(out).toMatch(/Recherche ist das Mittel/);
    // Die Recherche-Anweisung bleibt daneben stehen.
    expect(out).toContain('Recherche-Ergebnisse');
  });

  it('greift auch auf dem agentischen Pfad (intent=agentic faellt in den default-Zweig)', () => {
    const out = getModeGuidance(makeState({ intent: 'agentic', activeSkillMention: 'presse' }));
    expect(out).toMatch(/Recherche ist das Mittel/);
  });

  it('nimmt den LV-Titel, nicht den generischen', () => {
    const out = getModeGuidance(
      makeState({ intent: 'search', activeSkillMention: 'presse-hamburg' })
    );
    expect(out).toContain('PM Hamburg');
  });

  it('schweigt bei einer gewoehnlichen Recherchefrage', () => {
    const out = getModeGuidance(makeState({ intent: 'search' }));
    expect(out).not.toMatch(/Recherche ist das Mittel/);
  });

  // Der Kern des Umbaus: ein GENANNTES Textsorten-Nomen ist keine Bestellung.
  // Genau diese Formulierungen sind auf den Abruf-Pfaden der Normalfall, und
  // ein Hinweis darauf liesse das Modell schreiben statt suchen.
  it('schweigt, wenn die Textsorte nur genannt und nicht bestellt ist', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'search',
        documentSubtype: 'pressemitteilung',
        lastUserTextNoMentions: 'Was steht in der Pressemitteilung zum Radentscheid?',
      })
    );
    expect(out).not.toMatch(/Recherche ist das Mittel/);
  });
});

describe('getModeGuidance turn-outcome honesty (direct path)', () => {
  it('a direct turn carries the no-research/no-artifact honesty note', () => {
    const out = getModeGuidance(makeState({ intent: 'direct', searchResults: [] }));
    expect(out).toContain('NICHTS recherchiert');
    expect(out).toMatch(/keine Recherche/i);
  });
  it('save_as_doc keeps plain direct guidance (it DOES create a doc)', () => {
    const out = getModeGuidance(makeState({ intent: 'save_as_doc', searchResults: [] }));
    expect(out).not.toContain('NICHTS recherchiert');
  });
  it('a search turn does not get the direct honesty note', () => {
    const out = getModeGuidance(makeState({ intent: 'search' }));
    expect(out).not.toContain('NICHTS recherchiert');
  });
});

/**
 * Der Turn, der am 02.08.2026 einen Base64-Block als „.pptx" ausgab: Der
 * Nutzer verlangte eine Präsentation UND untersagte im selben Zug die Aktion,
 * das Gitter demotierte auf `produktion` — und sagte niemandem, warum.
 */
describe('getModeGuidance on a demoted artefact turn', () => {
  it('names the refused family and forbids a hand-built file', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'produktion',
        searchResults: [],
        forbiddenArtifactAction: 'presentation',
        lastUserTextNoMentions: 'Mach eine Präsentation, aber speichere nichts ab.',
      })
    );
    expect(out).toContain('Präsentation');
    expect(out).toMatch(/KEIN Artefakt erstellt/);
    expect(out).toContain('data:');
    expect(out).toContain('Erstellungsfunktion');
  });

  it('warns about hand-built files whenever the turn talks about them', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'produktion',
        searchResults: [],
        lastUserTextNoMentions: 'Der Block ist keine gültige Datei.',
      })
    );
    expect(out).toContain('data:');
    // No demotion happened, so no refusal sentence.
    expect(out).not.toMatch(/KEIN Artefakt erstellt/);
  });

  it('spends nothing on a turn that never mentions a file', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'direct',
        searchResults: [],
        lastUserTextNoMentions: 'Wie geht es dir heute?',
      })
    );
    expect(out).not.toContain('data:');
  });
});

/**
 * "Mehr dazu bitte" after a sourced answer classifies `direct`, and a `direct`
 * turn used to carry no sources at all — so the model rewrote its own previous
 * answer from that answer's prose. Carrying the thread's research fixes the
 * grounding; these two suites keep the fix from leaking into every other
 * `direct` turn.
 */
describe('citableSourcesAvailable', () => {
  const SRC = [{ source: 'x', content: 'c', url: 'https://e.org' }] as unknown as SearchResult[];

  it('opens for a direct turn whose sources were carried in', () => {
    expect(
      citableSourcesAvailable(
        makeState({ intent: 'direct', searchResults: SRC, sourcesCarriedFromThread: true })
      )
    ).toBe(true);
  });

  it('stays SHUT for an ordinary direct turn that happens to have sources', () => {
    // The regression guard the whole design rests on: without the flag a
    // direct turn must never be told it may cite.
    expect(citableSourcesAvailable(makeState({ intent: 'direct', searchResults: SRC }))).toBe(
      false
    );
  });

  it('needs actual sources, not just the flag', () => {
    expect(
      citableSourcesAvailable(
        makeState({ intent: 'direct', searchResults: [], sourcesCarriedFromThread: true })
      )
    ).toBe(false);
  });

  it('is unchanged for retrieval intents', () => {
    expect(citableSourcesAvailable(makeState({ intent: 'search', searchResults: SRC }))).toBe(true);
  });

  it('treats produktion exactly like direct — shut, unless sources were carried', () => {
    expect(citableSourcesAvailable(makeState({ intent: 'produktion', searchResults: SRC }))).toBe(
      false
    );
    expect(
      citableSourcesAvailable(
        makeState({ intent: 'produktion', searchResults: SRC, sourcesCarriedFromThread: true })
      )
    ).toBe(true);
  });

  it('opens for the residual: an agentic turn did its own retrieval', () => {
    expect(citableSourcesAvailable(makeState({ intent: 'agentic', searchResults: SRC }))).toBe(
      true
    );
  });

  it('stays shut for a greeting even with the carry flag set', () => {
    // `greeting` has no carry exception, unlike `direct`. The carry never runs
    // for it, so the flag can only arrive here through a bug — and a "Hallo"
    // answered with [1]–[6] is the failure this closes.
    expect(
      citableSourcesAvailable(
        makeState({ intent: 'greeting', searchResults: SRC, sourcesCarriedFromThread: true })
      )
    ).toBe(false);
  });
});

describe('getModeGuidance for greeting', () => {
  it('scopes the answer and claims neither research nor artefact', () => {
    const out = getModeGuidance(makeState({ intent: 'greeting', searchResults: [] }));
    expect(out).toMatch(/ein bis zwei S(ä|ae)tzen/);
    expect(out).toMatch(/nichts recherchiert/i);
  });

  it('drops the direct path’s citation-ban paragraph', () => {
    // The one turn in the product where nobody could have claimed a citation
    // does not need a paragraph of citation bans.
    const out = getModeGuidance(makeState({ intent: 'greeting', searchResults: [] }));
    expect(out).not.toMatch(/keine Quellen\/\[N\]-Belege/);
    expect(out.length).toBeLessThan(
      getModeGuidance(makeState({ intent: 'direct', searchResults: [] })).length
    );
  });
});

describe('getModeGuidance on a carried-source direct turn', () => {
  it('permits [N] but forbids claiming fresh research', () => {
    // Without this branch the prompt would carry a source block, "cite [1]-[6]"
    // AND "claim no sources/[N] citations" all at once.
    const out = getModeGuidance(makeState({ intent: 'direct', sourcesCarriedFromThread: true }));
    expect(out).toContain('FRÜHEREN Recherche');
    expect(out).toContain('[N]');
    expect(out).not.toMatch(/keine Quellen\/\[N\]-Belege/);
  });

  it('an ordinary direct turn keeps the citation ban', () => {
    const out = getModeGuidance(makeState({ intent: 'direct', searchResults: [] }));
    expect(out).toMatch(/keine Quellen\/\[N\]-Belege/);
    expect(out).not.toContain('FRÜHEREN Recherche');
  });
});

describe('getModeGuidance for compute intent', () => {
  it('when a result exists: tells the model to answer conversationally and NEVER ask the user for it', () => {
    const out = getModeGuidance(
      makeState({ intent: 'compute', computedResult: makeComputeResult() })
    );
    // The prose is the real answer, not a stub next to the card.
    expect(out).toContain('Beantworte die konkrete Frage');
    expect(out).toContain('Verneine NICHT');
    expect(out).toContain('bitte NIEMALS um das Ergebnis');
    // Regression guard: the fallback "ask for precision" wording must NOT leak
    // into the prompt when a number is already available — that clause is what
    // made the model deny "591 Zeichen" while the card showed it.
    expect(out).not.toContain('bitte um eine Präzisierung');
  });

  it('when no result exists: uses the fallback that asks for precision, without an anti-denial line', () => {
    const out = getModeGuidance(makeState({ intent: 'compute', computedResult: null }));
    expect(out).toContain('bitte um eine Präzisierung');
    expect(out).not.toContain('Verneine NICHT');
  });
});

/**
 * Both chart prompts, byte for byte.
 *
 * The two variants share their format block and most of their rules and were
 * kept as two copy-pasted literals; they are now composed from one template.
 * Pinning the exact strings is what makes that composition provable — a
 * substring assertion would have passed through a dropped rule or a lost
 * newline, and the model only ever sees the whole thing.
 */
const CHART_PROMPT_PLAUSIBLE = `\nDer*die Nutzer*in möchte ein Diagramm. Erstelle die Daten und gib sie als JSON-Block zurück.
Schreibe zuerst eine kurze Erklärung (1-2 Sätze), dann den JSON-Block in diesem Format:

\`\`\`chart
{"type":"bar","title":"Titel","data":[{"name":"A","wert":10},{"name":"B","wert":20}],"xKey":"name","yKeys":["wert"]}
\`\`\`

Regeln:
- type: "bar", "line", "area", "pie" oder "donut"
- data: Array mit Objekten, jedes hat einen xKey und mindestens einen yKey
- xKey: Name des Feldes für die X-Achse (z.B. "name", "monat", "jahr")
- yKeys: Array der Feldnamen für die Werte (z.B. ["wert", "wert2"])
- Verwende realistische, plausible Daten wenn keine konkreten Zahlen gegeben sind
- Der JSON-Block MUSS in \`\`\`chart ... \`\`\` eingeschlossen sein`;

const CHART_PROMPT_COMPUTED = `\nDer*die Nutzer*in möchte ein Diagramm. Die Werte wurden bereits deterministisch per Code berechnet (siehe BERECHNUNGSERGEBNIS) — verwende AUSSCHLIESSLICH diese Werte und erfinde KEINE Zahlen.
Schreibe zuerst eine kurze Erklärung (1-2 Sätze), dann den JSON-Block in diesem Format:

\`\`\`chart
{"type":"bar","title":"Titel","data":[{"name":"A","wert":10},{"name":"B","wert":20}],"xKey":"name","yKeys":["wert"]}
\`\`\`

Regeln:
- type: "bar", "line", "area", "pie" oder "donut"
- data: Array mit Objekten, jedes hat einen xKey und mindestens einen yKey — die Werte EXAKT aus dem BERECHNUNGSERGEBNIS übernehmen
- xKey: Name des Feldes für die X-Achse; yKeys: Array der Wert-Feldnamen
- Der JSON-Block MUSS in \`\`\`chart ... \`\`\` eingeschlossen sein`;

describe('getModeGuidance for chart intent', () => {
  it('grounds the chart on the computed values when a fresh result exists', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'chart',
        computedResult: makeComputeResult(),
        computedResultFresh: true,
      })
    );
    expect(out).toBe(CHART_PROMPT_COMPUTED);
    expect(out).toContain('AUSSCHLIESSLICH');
    expect(out).not.toContain('plausible Daten');
  });

  it('falls back to the plausible-data guidance without a fresh result', () => {
    const out = getModeGuidance(makeState({ intent: 'chart', computedResult: null }));
    expect(out).toBe(CHART_PROMPT_PLAUSIBLE);
    expect(out).toContain('plausible Daten');
    expect(out).not.toContain('AUSSCHLIESSLICH');
  });
});

describe('formatTabularComputeGuidance', () => {
  it('returns nothing without a tabular attachment', () => {
    const out = formatTabularComputeGuidance(makeState({ hasTabularAttachment: false }));
    expect(out).toBe('');
  });

  it('emits the code-block guidance for a tabular attachment without a result', () => {
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: null })
    );
    expect(out).toContain('```python');
    expect(out).toContain('automatisch ausgeführt');
  });

  it('suppresses code emission when a FRESH result exists (run-then-answer resume)', () => {
    const out = formatTabularComputeGuidance(
      makeState({
        hasTabularAttachment: true,
        computedResult: makeComputeResult(),
        computedResultFresh: true,
      })
    );
    expect(out).toContain('ERGEBNIS LIEGT BEREITS VOR');
    expect(out).toContain('KEINEN Code-Block');
    expect(out).not.toContain('```python');
  });

  it('keeps the code-block guidance when the result is only forwarded from the last turn', () => {
    // A stale lastComputeStore result must not block a NEW follow-up
    // computation (e.g. on clients without the run_python capability).
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: makeComputeResult() })
    );
    expect(out).toContain('```python');
  });

  it('never promises code execution to clients without the run_python capability', () => {
    // Mobile/voice: a python block would render but never run — the model must
    // derive the answer from the document context instead.
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: null, clientCanRunPython: false })
    );
    expect(out).toContain('KEIN Python-Interpreter');
    expect(out).not.toContain('```python');
    // The pandas guidance PROMISES execution ("wird **automatisch ausgeführt**");
    // the no-capability variant only forbids claiming it.
    expect(out).not.toContain('**automatisch ausgeführt**');
    expect(out).toContain('NIEMALS, dass Code automatisch ausgeführt wird');
  });

  it('still suppresses recomputation for a fresh result on capability-less clients', () => {
    // The server-side compute intent also sets computedResultFresh — that
    // branch is correct for every client and must win over the capability fork.
    const out = formatTabularComputeGuidance(
      makeState({
        hasTabularAttachment: true,
        computedResult: makeComputeResult(),
        computedResultFresh: true,
        clientCanRunPython: false,
      })
    );
    expect(out).toContain('ERGEBNIS LIEGT BEREITS VOR');
    expect(out).not.toContain('```python');
  });
});

/**
 * Research used to bypass this function entirely: `intent: 'research'` meant
 * Linkup had already WRITTEN the answer, and formatSearchContext returned a
 * wrapper directive telling the model to add two framing sentences above a
 * card. Research is now the same retrieval at a deeper tier, so it formats
 * chunks like every other search intent — there is no second answer-producer
 * left to defer to.
 */
describe('formatSearchContext routing', () => {
  it('formats a research turn from chunks, like any other retrieval intent', async () => {
    const out = await formatSearchContext(makeState({ intent: 'research' }));
    expect(out).toContain('## SUCHERGEBNISSE');
    expect(out).not.toContain('RECHERCHE ABGESCHLOSSEN');
    expect(out).not.toContain('DU BIST WRAPPER');
  });

  it('formats research and web identically — the tier is the only difference', async () => {
    const research = await formatSearchContext(makeState({ intent: 'research' }));
    const web = await formatSearchContext(makeState({ intent: 'web' }));
    expect(research).toBe(web);
  });

  it('returns empty string when there are no search results', async () => {
    const out = await formatSearchContext(makeState({ searchResults: [] }));
    expect(out).toBe('');
  });
});

describe('formatThreadAttachmentsContext — kein doppelter Ausgangstext', () => {
  const article = 'Die Grünen drängen auf einen Aktionsplan gegen Hitze. '.repeat(40);

  const doc = (extractedText: string | null, over: Partial<ThreadAttachment> = {}) =>
    ({
      id: 'a1',
      name: 'Eingefügter Text.txt',
      isImage: false,
      extractedText,
      summary: 'Kurzfassung',
      ...over,
    }) as ThreadAttachment;

  it('lässt den Anhang weg, wenn sein Text schon in der Historie steht', () => {
    const out = formatThreadAttachmentsContext([doc(article)], undefined, `Nutzer: ${article}`);
    expect(out).toBe('');
  });

  it('spielt ihn ein, wenn die Kürzung die Historie-Kopie entfernt hat', () => {
    // Der Rückfall ist der Punkt: ohne Historie-Kopie ist die Wiedereinspielung
    // die einzige Stelle, an der das Dokument den Prompt noch erreicht.
    const out = formatThreadAttachmentsContext([doc(article)], undefined, 'Und weiter?');
    expect(out).toContain('FRÜHERE DOKUMENTE');
    expect(out).toContain('Volltext-Auszug');
  });

  it('greift nicht bei kurzen Texten, wo Gleichheit Zufall wäre', () => {
    const out = formatThreadAttachmentsContext([doc('Hallo Welt')], undefined, 'Hallo Welt');
    expect(out).toContain('FRÜHERE DOKUMENTE');
  });

  it('ist unempfindlich gegen abweichende Umbrüche', () => {
    const inHistory = article.replace(/ /g, '\n');
    const out = formatThreadAttachmentsContext([doc(article)], undefined, inHistory);
    expect(out).toBe('');
  });

  it('lässt einen zweiten, nicht replizierten Anhang stehen', () => {
    const other = 'Ein ganz anderes Dokument über Radwege. '.repeat(40);
    const out = formatThreadAttachmentsContext(
      [doc(article), doc(other, { id: 'a2', name: 'Radwege.txt' })],
      undefined,
      article
    );
    expect(out).toContain('Radwege.txt');
    expect(out).not.toContain('Aktionsplan gegen Hitze');
  });

  it('rührt Bilder nicht an', () => {
    const out = formatThreadAttachmentsContext(
      [doc(null, { isImage: true, summary: 'Ein Foto von Katharina Dröge' })],
      undefined,
      'Ein Foto von Katharina Dröge'
    );
    expect(out).toContain('FRÜHERE BILDER');
  });
});

describe('Pipeline-Turn: genau ein Ausgangstext im Prompt', () => {
  const alt = 'Ein Artikel aus einem früheren Turn über Radwege. '.repeat(40);
  const pinned = 'Die Grünen fordern ein Sofortprogramm für Klimaanlagen. '.repeat(20);

  const state = (over: Partial<ChatGraphState> = {}) =>
    makeState({
      intent: 'produktion',
      searchResults: [],
      citations: [],
      agentConfig: { identifier: 'gruenerator-einfache-sprache', systemRole: 'ROLLE …' },
      threadAttachments: [
        {
          id: 'a1',
          name: 'Eingefügter Text.txt',
          mimeType: 'text/plain',
          isImage: false,
          extractedText: alt,
          documentId: null,
          summary: null,
          createdAt: new Date('2026-08-13T21:38:00Z'),
        } as ThreadAttachment,
      ],
      attachmentContext: alt,
      documentMentionContext: alt,
      ...over,
    });

  it('verdrängt jedes andere Material, sobald ein Text angeheftet ist', async () => {
    // Solange beides im Prompt steht, ist die Anheftung eine Bitte — und am
    // 13.08.2026 entschied sich das Modell für den Thread-Kontext, während die
    // Prüfkette gegen den angehefteten Text mass.
    const out = await buildSystemMessage(state({ pipelineSourceText: pinned }));
    expect(out).toContain('ZU ÜBERTRAGENDER TEXT');
    expect(out).toContain('Sofortprogramm für Klimaanlagen');
    expect(out).not.toContain('Radwege');
    expect(out).not.toContain('FRÜHERE DOKUMENTE');
  });

  it('lässt den gewöhnlichen Turn unberührt', async () => {
    const out = await buildSystemMessage(state({ pipelineSourceText: null }));
    expect(out).not.toContain('ZU ÜBERTRAGENDER TEXT');
    expect(out).toContain('Radwege');
  });
});
