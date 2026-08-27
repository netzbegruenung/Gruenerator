/**
 * The method texts are derived, not written here — these tests pin the
 * derivation. If someone later restates the citation protocol inline, the
 * "same protocol as the app" assertions are what notice.
 */
import { describe, expect, it } from 'vitest';

import {
  buildDraftPromptGeneral,
  buildDraftPromptGrundsatz,
} from '../../agents/langgraph/prompts.js';
import { getMcpExposedCollections } from '../../config/systemCollectionsConfig.js';

import {
  buildCollectionCatalog,
  buildCorpusMethodText,
  buildMethodDocument,
  buildNotebookMethodText,
  buildNotebookPrompt,
  buildRecherchePrompt,
} from './methodPrompts.js';

describe('answer surfaces in prompts.ts', () => {
  it('leaves the app surface byte-identical when the mcp surface is added', () => {
    // The app prompt is what notebook QA sends to the model on every question.
    // Its two UI-coupled lines are the ones the mcp surface replaces.
    const app = buildDraftPromptGrundsatz().system;
    expect(app).toContain('- Nur IDs aus der Referenz-Map verwenden. Keine erfinden.');
    expect(app).toContain('- KEINE Blockzitate (>) - die UI zeigt Quellen separat.');
    expect(app).toContain('- Finale "Quellen"-Sektion (wird von UI generiert)');
    expect(app).not.toContain('### 4. Quellenliste');
  });

  it('hands the source list to the client on the mcp surface', () => {
    const mcp = buildDraftPromptGrundsatz('Grüne Programme', 'mcp').system;
    // An MCP client has no UI to render citations, so forbidding a final
    // source list would leave the markers pointing at nothing.
    expect(mcp).not.toContain('Finale "Quellen"-Sektion');
    expect(mcp).toContain('### 4. Quellenliste (Pflicht)');
    expect(mcp).toContain('`[n] Titel — URL`');
    expect(mcp).toContain('- Nur die Quellen-Nummern aus den Tool-Ergebnissen verwenden.');
    expect(mcp).not.toContain('Referenz-Map');
  });

  it('keeps the substance of the protocol identical across surfaces', () => {
    const app = buildDraftPromptGrundsatz('X').system;
    const mcp = buildDraftPromptGrundsatz('X', 'mcp').system;
    for (const invariant of [
      '## QUELLENTREUE:',
      '- JEDE Faktenaussage MUSS mit mindestens einer Quellenangabe [n] belegt werden.',
      '- Setze [n] NACH dem Satzzeichen (Punkt, Komma): "...Aussage.[1]" NICHT "...Aussage[1]."',
      '- Bei Widersprüchen in Quellen: Benenne sie transparent',
      '- Gendere Personenbezeichnungen mit Genderstern (z.B. Bürger*innen, der*die Sprecher*in)',
      '- Strukturiere nach INHALTLICHEN Themen, nicht nach Dokumenten',
    ]) {
      expect(app).toContain(invariant);
      expect(mcp).toContain(invariant);
    }
  });
});

describe('method texts', () => {
  it('derives the corpus method from the political draft prompt', () => {
    const text = buildCorpusMethodText();
    const derived = buildDraftPromptGrundsatz('Grüne Programme und Beschlüsse', 'mcp').system;
    expect(text.startsWith(derived)).toBe(true);
    expect(text).toContain('## ABLAUF');
  });

  it('derives the notebook method from the general draft prompt', () => {
    const text = buildNotebookMethodText('Mein Notebook');
    expect(text.startsWith(buildDraftPromptGeneral('Mein Notebook', 'mcp').system)).toBe(true);
    expect(text).toContain('action="list"');
    expect(text).toContain('action="search"');
  });

  it('tells the client that synthesis is its own job, with the one exception', () => {
    const doc = buildMethodDocument();
    expect(doc).toContain('liefert Belege, keine fertigen Texte');
    expect(doc).toContain('`notebooks` mit `action="search"` synthetisiert serverseitig');
    expect(doc).toContain('gruenerator://sammlungen');
  });

  it('names the multi-query habit — one search is not a research step', () => {
    expect(buildCorpusMethodText()).toContain('Mehrfach suchen, nicht einmal');
    expect(buildCorpusMethodText()).toContain('gruenerator_get_filters');
  });
});

describe('collection catalog', () => {
  it('lists every mcp-exposed collection with its filter fields', () => {
    const catalog = buildCollectionCatalog();
    const exposed = getMcpExposedCollections();
    expect(exposed.length).toBeGreaterThan(15);
    for (const c of exposed) {
      expect(catalog).toContain(`\`${c.key}\``);
      expect(catalog).toContain(c.name);
    }
  });

  it('warns that the default search misses the opt-in collections', () => {
    // The single most common failure over v1 was a model concluding a
    // Landesverband "has nothing" after searching only the default collection.
    expect(buildCollectionCatalog()).toContain('musst du explizit anfragen');
  });
});

describe('prompt exchanges', () => {
  it('puts the protocol first and the question last', () => {
    const messages = buildRecherchePrompt('Was steht zum Radverkehr?', 'AT');
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.text).toContain('## ZITATIONS-PROTOKOLL:');
    expect(messages[0].content.text).toContain('Österreich');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].content.text).toBe('Was steht zum Radverkehr?');
  });

  it('routes DE to the German collections', () => {
    const text = buildRecherchePrompt('Frage', 'DE')[0].content.text;
    expect(text).toContain('`deutschland`');
    expect(text).not.toContain('Land: Österreich');
  });

  it('asks which notebook is meant when none was named', () => {
    expect(buildNotebookPrompt('Frage')[0].content.text).toContain('Frage die Person');
    expect(buildNotebookPrompt('Frage', 'Verkehr')[0].content.text).toContain('„Verkehr"');
  });
});
