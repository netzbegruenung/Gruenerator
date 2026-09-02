/**
 * Die beiden neuen Felder sind der einzige Weg, auf dem ein Zitat je den
 * Nutzer-Zweig von /chunk-context erreicht (#3138). Sie sind additiv: ein
 * Erzeuger, der sie weglässt, muss weiterhin gültig sein — heute lässt sie
 * JEDER weg (HotTopicPipeline.ts:282-289 bildet ResearchCitation ab, und die
 * kennt keine Dokument-Kennung). Ein Schema, das sie verlangte, hätte den
 * laufenden Monitor am nächsten Deploy abgeschaltet.
 */
import { monitorCitationSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const webCitation = {
  id: '1',
  title: 'Tagesschau: Debatte um das Klimageld',
  url: 'https://www.tagesschau.de/inland/klimageld-100.html',
  snippet: 'Die Bundesregierung diskutiert…',
};

describe('monitorCitationSchema', () => {
  it('nimmt ein Zitat ohne Dokument-Kennung an — der heutige Erzeuger', () => {
    const parsed = monitorCitationSchema.safeParse(webCitation);
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'documentId' in parsed.data).toBe(false);
    expect(parsed.success && 'chunkIndex' in parsed.data).toBe(false);
  });

  it('trägt documentId und chunkIndex, wenn ein Erzeuger sie mitschickt', () => {
    const parsed = monitorCitationSchema.parse({
      ...webCitation,
      documentId: '6d1f1c8e-2b4a-4c5d-8e9f-0a1b2c3d4e5f',
      chunkIndex: 4,
    });
    expect(parsed.documentId).toBe('6d1f1c8e-2b4a-4c5d-8e9f-0a1b2c3d4e5f');
    expect(parsed.chunkIndex).toBe(4);
  });

  it('nimmt chunkIndex 0 an — der erste Chunk ist ein gültiger Mittelpunkt', () => {
    expect(monitorCitationSchema.parse({ ...webCitation, chunkIndex: 0 }).chunkIndex).toBe(0);
  });

  it('weist einen negativen oder gebrochenen chunkIndex ab', () => {
    expect(monitorCitationSchema.safeParse({ ...webCitation, chunkIndex: -1 }).success).toBe(false);
    expect(monitorCitationSchema.safeParse({ ...webCitation, chunkIndex: 1.5 }).success).toBe(
      false
    );
  });

  it('weist eine nicht-zeichenkettige documentId ab', () => {
    expect(monitorCitationSchema.safeParse({ ...webCitation, documentId: 42 }).success).toBe(false);
  });
});
