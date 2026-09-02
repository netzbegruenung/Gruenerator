/**
 * Der Helfer, der die vier Strukturfelder in jedes Payload-Literal spreizt.
 *
 * Er muss zwei Eingaben vertragen: einen Chunk vom Struktur-Pfad und einen
 * Chunk ohne jede Struktur (Fließtext, alter Bestand, der tote hierarchische
 * Chunker mit seinen sechs anderen `chunkType`-Werten).
 */

import { describe, expect, it } from 'vitest';

import { structurePayload } from './structurePayload.js';

describe('structurePayload', () => {
  it('liefert die vier snake_case-Schlüssel eines Struktur-Chunks', () => {
    expect(
      structurePayload({
        metadata: {
          headingPath: ['Kapitel 3: Wärmewende', '3.1 Förderprogramme'],
          heading: '3.1 Förderprogramme',
          chunkType: 'table',
          sectionIndex: 2,
        },
      })
    ).toEqual({
      heading_path: ['Kapitel 3: Wärmewende', '3.1 Förderprogramme'],
      heading: '3.1 Förderprogramme',
      chunk_type: 'table',
      section_index: 2,
    });
  });

  it('liefert für einen Chunk ohne Struktur lauter Leerwerte, nie undefined', () => {
    expect(structurePayload({ metadata: {} })).toEqual({
      heading_path: null,
      heading: null,
      chunk_type: 'text',
      section_index: null,
    });
    expect(structurePayload({})).toEqual({
      heading_path: null,
      heading: null,
      chunk_type: 'text',
      section_index: null,
    });
  });

  it('engt die sechs Werte des hierarchischen Chunkers auf text ein', () => {
    expect(structurePayload({ metadata: { chunkType: 'paragraph_content' } }).chunk_type).toBe(
      'text'
    );
    expect(structurePayload({ metadata: { chunkType: 'table_content' } }).chunk_type).toBe('text');
  });

  it('leitet heading aus dem Pfad ab, wenn es fehlt', () => {
    expect(structurePayload({ metadata: { headingPath: ['A', 'B'] } }).heading).toBe('B');
  });

  it('wirft leere und nicht-string-Einträge aus dem Pfad', () => {
    // Der Typ sagt `string[]`, die Laufzeit hat schon anderes geliefert (alte
    // Payloads, fremde Ingest-Pfade) — deshalb filtert der Helfer weiterhin.
    const schmutzigerPfad = ['A', '', null, 7, 'B'] as unknown as string[];
    expect(structurePayload({ metadata: { headingPath: schmutzigerPfad } }).heading_path).toEqual([
      'A',
      'B',
    ]);
    expect(structurePayload({ metadata: { headingPath: [] } }).heading_path).toBeNull();
  });
});
