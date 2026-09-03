/**
 * Momentaufnahme des Fließtext-Pfads, aufgenommen VOR dem Struktur-Umbau
 * (#3122).
 *
 * Der Umbau darf an einem Dokument ohne Markdown-Überschriften und ohne
 * Pipe-Zeilen nichts ändern — kein Byte, keine Grenze, keine Chunk-Zahl. Ohne
 * diesen Riegel driften alle Sammlungen ohne Markdown still auseinander, und
 * es fällt erst bei der nächsten Eval nach einem Re-Ingest auf, also frühestens
 * Wochen später.
 *
 * Wenn dieser Test nach einer Änderung rot wird, ist NICHT der Snapshot falsch.
 * Dann hat der strukturierte Pfad einen Text übernommen, der ihm nicht gehört.
 */

import { describe, expect, it } from 'vitest';

import { PROSE_FIXTURE } from './chunkFixtures.js';
import { smartChunkDocument } from './TextChunker.js';

describe('smartChunkDocument — Fließtext bleibt, wie er ist', () => {
  it('erzeugt für reinen Fließtext byteweise dieselben Chunks wie am 02.09.2026', async () => {
    const chunks = await smartChunkDocument(PROSE_FIXTURE, {
      baseMetadata: { title: 'Wärmewende' },
    });

    expect(chunks.map((c) => c.text)).toMatchSnapshot();
    expect(chunks.map((c) => c.text.length)).toMatchSnapshot();
  });

  it('hält die Obergrenze von 1600 Zeichen ein', async () => {
    const chunks = await smartChunkDocument(PROSE_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1600);
    }
  });

  it('verliert keinen Satzanfang aus dem Ausgangstext', async () => {
    const chunks = await smartChunkDocument(PROSE_FIXTURE);
    const joined = chunks.map((c) => c.text).join(' ');
    for (const anfang of [
      'Die Wärmewende ist die größte Aufgabe',
      'Die kommunale Wärmeplanung ist der Schlüssel',
      'Handwerk und Ausbildung entscheiden',
      'Mieterinnen und Mieter dürfen die Kosten',
      'Die Industrie braucht grünen Wasserstoff',
      'Die Umstellung gelingt nur mit einer ehrlichen Debatte',
    ]) {
      expect(joined).toContain(anfang);
    }
  });
});
