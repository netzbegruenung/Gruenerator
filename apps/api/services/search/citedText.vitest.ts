import { describe, it, expect } from 'vitest';

import { vectorConfig } from '../../config/vectorConfig.js';

import { validateAndInjectCitations } from './SearchResultProcessor.js';

import type { ReferencesMap } from './types.js';

const MAX = vectorConfig.get('content').maxExcerptLength;

const filler = 'Einleitung ohne Bezug. '.repeat(20);
const map: ReferencesMap = {
  '1': {
    title: 'Programm',
    snippets: [[filler.slice(0, 300)]],
    chunk_text: `${filler}Der Hitzeaktionsplan sieht Trinkbrunnen in jedem Bezirk vor. ${filler}`,
    description: null,
    date: null,
    source: 's',
    document_id: 'd',
    source_url: null,
    filename: null,
    similarity_score: 0.9,
    chunk_index: 0,
    page_number: null,
  },
};

const longFiller = 'Einleitung ohne Bezug. '.repeat(120);
const longMap: ReferencesMap = {
  '1': {
    ...map['1'],
    chunk_text: `${longFiller}Der Hitzeaktionsplan sieht Trinkbrunnen in jedem Bezirk vor. ${longFiller}`,
  },
};

describe('cited_text', () => {
  it('quotes the passage that carries the question, not the chunk head', () => {
    const { citations } = validateAndInjectCitations('Es gibt Trinkbrunnen.[1]', map, {
      question: 'Was sieht der Hitzeaktionsplan vor?',
    });
    expect(citations[0].cited_text).toContain('Hitzeaktionsplan');
    // Der Chunk passt unter die Decke — dann gibt es nichts zu wählen und
    // nichts wegzuschneiden.
    expect(citations[0].cited_text).toBe(map['1'].chunk_text);
  });

  /**
   * Der Ausschnitt wird verschoben, nicht gekürzt: das Fenster ist so breit wie
   * die Suchvorschau. Ein engerer Deckel würde auch den Folgeturn ärmer machen —
   * `notebookHistoryService` trägt `cited_text` als `chunk_text` weiter.
   */
  it('moves the window to the answering sentence without shrinking below the preview budget', () => {
    const { citations } = validateAndInjectCitations('Es gibt Trinkbrunnen.[1]', longMap, {
      question: 'Was sieht der Hitzeaktionsplan vor?',
    });
    expect(longMap['1'].chunk_text!.indexOf('Hitzeaktionsplan')).toBeGreaterThan(MAX);
    expect(citations[0].cited_text).toContain('Trinkbrunnen in jedem Bezirk');
    expect(citations[0].cited_text.length).toBeLessThanOrEqual(MAX);
    expect(citations[0].cited_text.length).toBeGreaterThan(MAX / 2);
  });

  it('falls back to the snippet without a question', () => {
    const { citations } = validateAndInjectCitations('Aussage.[1]', map);
    expect(citations[0].cited_text).toBe(filler.slice(0, 300));
  });

  /**
   * Kein Fenster zu verschieben, weil die Frage kein lexikalisches Signal
   * gegen den Chunk trägt (`selectRelevantExcerpt` liefert `null`) — der
   * Fallback muss trotzdem unter der Decke bleiben, nicht den ganzen
   * mehrere-KB-Chunk zitieren.
   */
  it('caps the fallback when the question carries no lexical signal against a long chunk', () => {
    const { citations } = validateAndInjectCitations('Aussage.[1]', longMap, {
      question: 'Wie funktioniert Photosynthese in Algen?',
    });
    expect(longMap['1'].chunk_text!.length).toBeGreaterThan(MAX);
    expect(citations[0].cited_text.length).toBeLessThanOrEqual(MAX);
    expect(citations[0].cited_text).not.toBe(longMap['1'].chunk_text);
  });
});
