/**
 * Die AcroForm-Prüfung beim Upload trägt seit #2835 ZWEI Entscheidungen: was
 * persistiert wird (`fileData`, mit Grössendeckel) und was diesem Turn als
 * Formular-Kandidat gilt (`pdfIsFillable`, ohne Deckel). Diese Tests pinnen
 * die Entkopplung — der Fehlermodus wäre still: ein Urteil, das am Deckel
 * hängt, nähme einem übergrossen Formular die Werkzeuge auf genau dem Turn,
 * auf dem seine Bytes vorliegen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExtract = vi.fn();
const mockReadFormFields = vi.fn();

vi.mock('../../../services/OcrService/index.js', () => ({
  OCRService: class {
    extractTextFromBase64 = mockExtract;
  },
}));

vi.mock('../../../services/pdfForm/pdfFormService.js', () => ({
  readFormFields: mockReadFormFields,
  fillFormFields: vi.fn(),
}));

const { processAttachments } = await import('./attachmentProcessingService.js');

const pdf = (over: { name?: string; data?: string } = {}) => ({
  name: over.name ?? 'Antrag.pdf',
  type: 'application/pdf',
  size: 100,
  data: over.data ?? 'cGRm',
  isImage: false,
});

describe('processAttachments — pdfIsFillable', () => {
  beforeEach(() => {
    mockExtract.mockReset().mockResolvedValue({ text: 'Inhalt', pageCount: 1 });
    mockReadFormFields.mockReset();
  });

  it('meldet ein Formular-PDF als ausfüllbar und persistiert seine Bytes', async () => {
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);

    const { processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(processedMeta[0].pdfIsFillable).toBe(true);
    expect(processedMeta[0].fileData).toBe('cGRm');
  });

  it('meldet ein Nicht-Formular-PDF als nicht ausfüllbar — ohne Bytes', async () => {
    mockReadFormFields.mockResolvedValue([]);

    const { processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(processedMeta[0].pdfIsFillable).toBe(false);
    expect(processedMeta[0].fileData).toBeUndefined();
  });

  it('hält das Urteil auch für ein übergrosses Formular fest, das nicht persistiert wird', async () => {
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);
    // > MAX_PDF_BYTES_PERSISTED (8 MiB roh): base64-Länge * 3/4 muss darüber liegen.
    const oversized = pdf({ data: 'A'.repeat(11_200_000) });

    const { processedMeta } = await processAttachments([oversized], 'req-1');

    expect(processedMeta[0].pdfIsFillable).toBe(true);
    expect(processedMeta[0].fileData).toBeUndefined();
  });

  it('wertet ein unlesbares PDF als nicht ausfüllbar (fail-closed)', async () => {
    mockReadFormFields.mockRejectedValue(new Error('kaputt'));

    const { processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(processedMeta[0].pdfIsFillable).toBe(false);
  });

  it('trägt das Urteil auch, wenn die Textextraktion scheitert', async () => {
    // Der catch-Zweig persistiert `fileData` ebenfalls — das Urteil muss dort
    // genauso ankommen, sonst verlöre ein Formular mit OCR-Schluckauf die
    // Werkzeuge auf seinem Upload-Turn.
    mockExtract.mockRejectedValue(new Error('OCR down'));
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);

    const { processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(processedMeta[0].pdfIsFillable).toBe(true);
    expect(processedMeta[0].fileData).toBe('cGRm');
  });

  it('setzt das Feld für Nicht-PDFs gar nicht', async () => {
    const { processedMeta } = await processAttachments(
      [{ name: 'Notiz.txt', type: 'text/plain', size: 10, data: 'dHh0', isImage: false }],
      'req-1'
    );

    expect('pdfIsFillable' in processedMeta[0]).toBe(false);
  });
});
