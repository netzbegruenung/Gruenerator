import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Der Dreizeiler ohne mitgeschicktes Bild laesst die KI eine Vorlage waehlen.
 * Diese Vorlagen sind mehrere MB gross; frueher wurden sie fuer den Transport
 * nach base64 kodiert und im Canvas-Adapter sofort wieder dekodiert. Der
 * 7,4-MB-String dabei war es, der `extractBase64FromDataUrl` zum
 * "Maximum call stack size exceeded" gebracht hat.
 *
 * Geprueft wird deshalb der Transport, nicht das Bild: was am Canvas ankommt,
 * muessen die unveraenderten Bytes der Datei sein — ohne base64 dazwischen.
 */

/** Steht fuer eine Vorlage in realistischer Groesse (5,5 MB wie im Vorfall). */
const VORLAGE_BYTES = Buffer.alloc(5_542_113, 0x42);
const vorlagePfad = path.join(os.tmpdir(), `sharepic-vorlage-${process.pid}.jpg`);
fs.writeFileSync(vorlagePfad, VORLAGE_BYTES);

let empfangeneDatei: { buffer?: Buffer } | null = null;

// vi.mock wird hochgezogen — die Attrappe muss inline stehen.
vi.mock('../../routes/sharepic/sharepic_canvas/dreizeilen_canvas.js', () => ({
  default: {
    stack: [
      {
        route: {
          path: '/',
          methods: { post: true },
          stack: [
            {
              handle: (
                req: { file?: { buffer?: Buffer } },
                res: { json: (p: unknown) => void }
              ) => {
                empfangeneDatei = req.file ?? null;
                res.json({ image: 'data:image/png;base64,AA==' });
              },
            },
          ],
        },
      },
    ],
  },
}));

vi.mock('../../routes/sharepic/sharepic_text/index.js', () => ({
  handleSharepicTextRequest: (_req: unknown, res: { json: (p: unknown) => void }): void => {
    res.json({
      success: true,
      alternatives: [],
      mainSlogan: { line1: 'Eure Stimme', line2: 'zaehlt', line3: 'jetzt' },
    });
  },
}));

vi.mock('../../services/image/ImageSelectionService.js', () => ({
  default: {
    getImagePath: () => vorlagePfad,
    selectBestImage: () =>
      Promise.resolve({
        selectedImage: { filename: 'vorlage.jpg' },
        confidence: 0.92,
        reasoning: 'Attrappe',
      }),
  },
}));

const { generateSharepicForChat, createImageAttachmentFromFile } =
  await import('./sharepicGenerationService.js');

const req = {
  app: { locals: {} },
  headers: {},
} as unknown as Parameters<typeof generateSharepicForChat>[0];

afterAll(() => {
  fs.rmSync(vorlagePfad, { force: true });
});

describe('Dreizeiler mit KI-Bildauswahl', () => {
  it('laedt die Vorlage als Bytes, nicht als Data-URL', async () => {
    // Der eigentliche Regressionsschutz: sobald hier wieder eine Data-URL
    // entsteht, ist der 7,4-MB-String zurueck.
    const attachment = await createImageAttachmentFromFile('vorlage.jpg');

    expect(attachment.bytes?.length).toBe(VORLAGE_BYTES.length);
    expect(attachment.data).toBeUndefined();
    expect(attachment.size).toBe(VORLAGE_BYTES.length);
  });

  it('reicht die Vorlage als Bytes an den Canvas durch', async () => {
    // Ohne Anhang faellt der Dreizeiler in die KI-Auswahl.
    const ergebnis = await generateSharepicForChat(req, 'dreizeilen', { text: 'Windkraft' });

    expect(ergebnis.success).toBe(true);
    expect(empfangeneDatei?.buffer?.length).toBe(VORLAGE_BYTES.length);
    expect(empfangeneDatei?.buffer?.subarray(0, 16).equals(VORLAGE_BYTES.subarray(0, 16))).toBe(
      true
    );
  });
});
