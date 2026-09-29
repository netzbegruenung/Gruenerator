import { describe, expect, it, vi } from 'vitest';

import { makeBildAnsehenTool } from './imageTools.js';

import type { VisionAnalysisResult } from '../../../services/vision/VisionService.js';

type Exec = (input: unknown, options: unknown) => Promise<Record<string, unknown>>;
const execOf = (t: unknown) => (t as { execute: Exec }).execute;

const images = [
  { name: 'beleg.jpg', type: 'image/jpeg', data: 'QUJD' },
  { name: 'plakat.png', type: 'image/png', data: 'REVG' },
];

function toolWith(result: VisionAnalysisResult | Error) {
  const analyzeWithOcr = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return {
    analyzeWithOcr,
    execute: execOf(makeBildAnsehenTool({ images, vision: { analyzeWithOcr } })),
  };
}

const noText = { hasText: false, textType: 'none', confidence: 0, briefDescription: '' } as const;

describe('bild_ansehen', () => {
  it('asks the vision model the question about the addressed image', async () => {
    const { analyzeWithOcr, execute } = toolWith({
      description: 'Drei Personen vor einem Rathaus.',
      textDetection: noText,
      extractedText: null,
    });
    const out = await execute({ bild: 2, frage: 'Wer ist zu sehen?' }, {});

    // The mime type travels with the bytes; a bare base64 string would be read
    // as JPEG by the service.
    expect(analyzeWithOcr).toHaveBeenCalledWith('data:image/png;base64,REVG', 'Wer ist zu sehen?');
    expect(out).toEqual({ bild: 'plakat.png', antwort: 'Drei Personen vor einem Rathaus.' });
  });

  it('passes the OCR text through verbatim when the image has text', async () => {
    const { execute } = toolWith({
      description: 'Eine Hotelrechnung.',
      textDetection: { ...noText, hasText: true, textType: 'document', confidence: 0.9 },
      extractedText: 'Hotel Adler\nGesamt 265,82 EUR',
    });
    const out = await execute({ bild: 1, frage: 'Betrag und Datum' }, {});
    expect(out.text).toBe('Hotel Adler\nGesamt 265,82 EUR');
  });

  it('says so instead of guessing when the vision call fails', async () => {
    const { execute } = toolWith(new Error('503'));
    const out = await execute({ bild: 1, frage: 'Was steht drauf?' }, {});
    expect(out.error).toContain('beleg.jpg');
    expect(out.error).toContain('rate den Inhalt nicht');
  });

  it('rejects a number with no image behind it', async () => {
    const { analyzeWithOcr, execute } = toolWith({
      description: '',
      textDetection: noText,
      extractedText: null,
    });
    const out = await execute({ bild: 3, frage: 'x' }, {});
    expect(out.error).toContain('kein Bild 3');
    expect(analyzeWithOcr).not.toHaveBeenCalled();
  });
});
