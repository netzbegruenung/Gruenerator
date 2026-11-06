import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { turnImagesOf } from '../services/turnImages.js';

import { makeBildAnsehenTool } from './imageTools.js';

import { type VisionAnalysisResult } from '../../../services/vision/VisionService.js';

type Exec = (input: unknown, options: unknown) => Promise<Record<string, unknown>>;
const execOf = (t: unknown) => (t as { execute: Exec }).execute;

const attachments = [
  { name: 'beleg.jpg', type: 'image/jpeg', data: 'QUJD' },
  { name: 'plakat.png', type: 'image/png', data: 'REVG' },
];
const images = turnImagesOf({ imageAttachments: attachments, wolkeFiles: [] });

const noText = { hasText: false, textType: 'none', confidence: 0, briefDescription: '' } as const;

function toolWith(result: VisionAnalysisResult | Error) {
  const analyzeWithOcr = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const sourceRegistry = createSourceRegistry();
  const execute = execOf(
    makeBildAnsehenTool({ images, sourceRegistry, vision: { analyzeWithOcr } })
  );
  return { analyzeWithOcr, sourceRegistry, execute };
}

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
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('Bild 2: plakat.png');
    expect(out.sources).toContain('Drei Personen vor einem Rathaus.');
  });

  // The split writer has no tool replay: the registry is where it reads the
  // finding (#3841 review). Nothing registered = a writer denying the image.
  it('registers the finding so the tool-less writer sees it', async () => {
    const { sourceRegistry, execute } = toolWith({
      description: 'Ein Plakat.',
      textDetection: noText,
      extractedText: null,
    });
    await execute({ bild: 1, frage: 'Was ist das?' }, {});
    expect(sourceRegistry.size).toBe(1);
  });

  it('keeps a long OCR text whole instead of the generic 750-char cut', async () => {
    const ocr = `Hotel Adler\n${'Position 12,00 EUR\n'.repeat(400)}Gesamt 265,82 EUR`;
    const { execute } = toolWith({
      description: 'Eine Hotelrechnung.',
      textDetection: { ...noText, hasText: true, textType: 'document', confidence: 0.9 },
      extractedText: ocr,
    });
    const out = await execute({ bild: 1, frage: 'Betrag und Datum' }, {});
    expect(out.sources).toContain('Erkannter Text (OCR, wörtlich)');
    expect(out.sources).toContain('Gesamt 265,82 EUR');
  });

  it('says so instead of guessing when the vision call fails', async () => {
    const { sourceRegistry, execute } = toolWith(new Error('503'));
    const out = await execute({ bild: 1, frage: 'Was steht drauf?' }, {});
    expect(out.error).toContain('beleg.jpg');
    expect(out.error).toContain('rate den Inhalt nicht');
    expect(sourceRegistry.size).toBe(0);
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

describe('bild_ansehen mit Wolke-Foto', () => {
  const wolke = [{ shareLinkId: 's1', path: '/Fotos/IMG_2601.jpg', name: 'IMG_2601.jpg' }];
  const ok = {
    description: 'Eine Frau am Strand.',
    textDetection: noText,
    extractedText: null,
  } as VisionAnalysisResult;

  it('lädt das Foto beim ersten Gebrauch und fragt Vision danach', async () => {
    const download = vi.fn(async () => ({
      ok: true as const,
      buffer: Buffer.from('ABC'),
      mimeType: 'image/jpeg',
      size: 3,
    }));
    const analyzeWithOcr = vi.fn(async () => ok);
    const sourceRegistry = createSourceRegistry();
    const turn = turnImagesOf(
      { imageAttachments: [], wolkeFiles: wolke, agentConfig: { userId: 'u1' } },
      download
    );
    const execute = execOf(
      makeBildAnsehenTool({ images: turn, sourceRegistry, vision: { analyzeWithOcr } })
    );
    expect(download).not.toHaveBeenCalled();
    const out = await execute({ bild: 1, frage: 'Wer ist zu sehen?' }, {});
    await execute({ bild: 1, frage: 'Und der Hintergrund?' }, {});
    expect(analyzeWithOcr).toHaveBeenCalledWith('data:image/jpeg;base64,QUJD', 'Wer ist zu sehen?');
    expect(out.sources).toContain('Bild 1: IMG_2601.jpg');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('meldet einen fehlgeschlagenen Download ehrlich, ohne zu werfen', async () => {
    const download = vi.fn(async () => ({ ok: false as const, message: 'Freigabe fehlt' }));
    const analyzeWithOcr = vi.fn();
    const turn = turnImagesOf(
      { imageAttachments: [], wolkeFiles: wolke, agentConfig: { userId: 'u1' } },
      download
    );
    const execute = execOf(
      makeBildAnsehenTool({
        images: turn,
        sourceRegistry: createSourceRegistry(),
        vision: { analyzeWithOcr },
      })
    );
    const out = await execute({ bild: 1, frage: 'x' }, {});
    expect(out.error).toContain('IMG_2601.jpg');
    expect(out.error).toContain('Freigabe fehlt');
    expect(analyzeWithOcr).not.toHaveBeenCalled();
  });

  it('weist ein zu großes Foto ab', async () => {
    const download = vi.fn(async () => ({
      ok: true as const,
      buffer: Buffer.from('A'),
      mimeType: null,
      size: 26 * 1024 * 1024,
    }));
    const [entry] = turnImagesOf(
      { imageAttachments: [], wolkeFiles: wolke, agentConfig: { userId: 'u1' } },
      download
    );
    expect(await entry!.load()).toMatchObject({ ok: false });
  });

  it('nummeriert Anhänge vor Wolke-Fotos und ignoriert Nicht-Fotos', () => {
    const turn = turnImagesOf(
      {
        imageAttachments: attachments.slice(0, 1),
        wolkeFiles: [...wolke, { shareLinkId: 's1', path: '/x.pdf', name: 'x.pdf' }],
        agentConfig: { userId: 'u1' },
      },
      vi.fn()
    );
    expect(turn.map((t) => t.name)).toEqual(['beleg.jpg', 'IMG_2601.jpg']);
  });
});
