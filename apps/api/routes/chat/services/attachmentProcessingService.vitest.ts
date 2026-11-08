/**
 * Die AcroForm-Prüfung beim Upload trägt seit #2835 ZWEI Entscheidungen: was
 * persistiert wird (`fileData`, mit Grössendeckel) und was diesem Turn als
 * Formular-Kandidat gilt (`pdfFormCandidates`, ohne Deckel). Die Kandidaten
 * werden am Ort des Urteils gebaut — gleiches Objekt wie die Prüfung —, damit
 * keine zweite Liste per Name oder Position gepaart werden muss: beides war
 * angreifbar (Namenskollision bzw. client-gesendetes `isImage`-Flag, Review
 * auf #2862). Der Fehlermodus der Deckel-Kopplung wäre still: ein Urteil, das
 * am Deckel hängt, nähme einem übergrossen Formular die Werkzeuge auf genau
 * dem Turn, auf dem seine Bytes vorliegen.
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

const { processAttachments, materialSectionHeading, pasteOpening, PASTED_TEXT_HEADING } =
  await import('./attachmentProcessingService.js');

const pdf = (over: { name?: string; data?: string; isImage?: boolean } = {}) => ({
  name: over.name ?? 'Antrag.pdf',
  type: 'application/pdf',
  size: 100,
  data: over.data ?? 'cGRm',
  isImage: over.isImage ?? false,
});

describe('processAttachments — pdfFormCandidates', () => {
  beforeEach(() => {
    mockExtract.mockReset().mockResolvedValue({ text: 'Inhalt', pageCount: 1 });
    mockReadFormFields.mockReset();
  });

  it('macht ein Formular-PDF zum Kandidaten und persistiert seine Bytes', async () => {
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);

    const { pdfFormCandidates, processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(pdfFormCandidates).toEqual([{ name: 'Antrag.pdf', data: 'cGRm' }]);
    expect(processedMeta[0].fileData).toBe('cGRm');
  });

  it('lässt ein Nicht-Formular-PDF draussen — kein Kandidat, keine Bytes', async () => {
    mockReadFormFields.mockResolvedValue([]);

    const { pdfFormCandidates, processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(pdfFormCandidates).toEqual([]);
    expect(processedMeta[0].fileData).toBeUndefined();
  });

  it('behält ein übergrosses Formular als Kandidaten, ohne es zu persistieren', async () => {
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);
    // > MAX_PDF_BYTES_PERSISTED (8 MiB roh): base64-Länge * 3/4 muss darüber liegen.
    const oversized = pdf({ data: 'A'.repeat(11_200_000) });

    const { pdfFormCandidates, processedMeta } = await processAttachments([oversized], 'req-1');

    expect(pdfFormCandidates).toHaveLength(1);
    expect(processedMeta[0].fileData).toBeUndefined();
  });

  it('paart das Urteil pro Objekt, nicht pro Name — Kollision erbt nichts', async () => {
    // Zwei gleichnamige PDFs im selben Turn, nur das erste ist ein Formular
    // (Review-Befund auf #2862): der Kandidat trägt die Bytes des Formulars,
    // das Nicht-Formular taucht nicht auf.
    mockReadFormFields.mockResolvedValueOnce([{ name: 'Feld1' }]).mockResolvedValueOnce([]);

    const { pdfFormCandidates } = await processAttachments(
      [pdf({ data: 'Zm9ybQ==' }), pdf({ data: 'ZG9j' })],
      'req-1'
    );

    expect(pdfFormCandidates).toEqual([{ name: 'Antrag.pdf', data: 'Zm9ybQ==' }]);
  });

  it('ignoriert ein gelogenes isImage-Flag des Clients', async () => {
    // Zweiter Review-Befund auf #2862: die Bild-Klassifikation läuft hier
    // serverseitig über den MIME-Typ — ein PDF mit `isImage: true` wird
    // trotzdem als Dokument geprüft und Kandidat. Es gibt keine zweite Liste
    // mehr, deren Indizes das Flag verschieben könnte.
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);

    const { pdfFormCandidates, imageAttachments } = await processAttachments(
      [pdf({ isImage: true })],
      'req-1'
    );

    expect(pdfFormCandidates).toEqual([{ name: 'Antrag.pdf', data: 'cGRm' }]);
    expect(imageAttachments).toEqual([]);
  });

  it('wertet ein unlesbares PDF als Nicht-Formular (fail-closed)', async () => {
    mockReadFormFields.mockRejectedValue(new Error('kaputt'));

    const { pdfFormCandidates } = await processAttachments([pdf()], 'req-1');

    expect(pdfFormCandidates).toEqual([]);
  });

  it('behält den Kandidaten auch, wenn die Textextraktion scheitert', async () => {
    // Das Urteil fällt VOR dem OCR-try — ein Formular mit OCR-Schluckauf darf
    // die Werkzeuge auf seinem Upload-Turn nicht verlieren.
    mockExtract.mockRejectedValue(new Error('OCR down'));
    mockReadFormFields.mockResolvedValue([{ name: 'Feld1' }]);

    const { pdfFormCandidates, processedMeta } = await processAttachments([pdf()], 'req-1');

    expect(pdfFormCandidates).toHaveLength(1);
    expect(processedMeta[0].fileData).toBe('cGRm');
  });

  it('prüft Nicht-PDFs gar nicht erst', async () => {
    const { pdfFormCandidates } = await processAttachments(
      [{ name: 'Notiz.txt', type: 'text/plain', size: 10, data: 'dHh0', isImage: false }],
      'req-1'
    );

    expect(pdfFormCandidates).toEqual([]);
    expect(mockReadFormFields).not.toHaveBeenCalled();
  });
});

describe('processAttachments — Seitenmarken', () => {
  beforeEach(() => {
    mockReadFormFields.mockReset().mockResolvedValue([]);
    mockExtract
      .mockReset()
      .mockResolvedValue({ text: '## Seite 1\n\nPräambel\n\n## Seite 2\n\nA1', pageCount: 2 });
  });

  it('fordert die Marken an und reicht den markierten Text samt Seitenzahl weiter', async () => {
    const { processedMeta, attachmentContext } = await processAttachments([pdf()], 'req-1');

    expect(mockExtract).toHaveBeenCalledWith('cGRm', 'Antrag.pdf', 'application/pdf', {
      pageMarkers: true,
    });
    expect(processedMeta[0].extractedText).toBe('## Seite 1\n\nPräambel\n\n## Seite 2\n\nA1');
    expect(processedMeta[0].pageCount).toBe(2);
    expect(attachmentContext).toContain('## Seite 2\n\nA1');
  });
});

// #5423: ein Paste stand als `### Eingefügter Text.txt (Volltext-Auszug)` unter
// ANGEHÄNGTE DOKUMENTE, und das Modell fragte zurück, ob die Liste „aus dem
// angehängten Dokument" gemeint sei. Die Überschrift sagt jetzt, was er ist.
describe('processAttachments — eingefügter Text', () => {
  const textFile = (name: string, type = 'text/plain') => ({
    name,
    type,
    size: 10,
    isImage: false,
    data: Buffer.from('12.01. Neujahrsempfang', 'utf8').toString('base64'),
  });

  beforeEach(() => {
    mockExtract.mockReset().mockResolvedValue({ text: '12.01. Neujahrsempfang', pageCount: 1 });
  });

  const kinds = (items: { kind: string }[]): string[] => items.map((item) => item.kind);

  it('überschreibt den Paste als Teil der Nachricht, nicht als Datei', async () => {
    const { attachmentContext, turnMaterial } = await processAttachments(
      [textFile('Eingefügter Text.txt')],
      'req-1'
    );
    expect(attachmentContext).toContain(`### ${PASTED_TEXT_HEADING}\n`);
    expect(attachmentContext).not.toContain('.txt');
    expect(kinds(turnMaterial)).toEqual(['paste']);
  });

  it('lässt eine hochgeladene Textdatei eine Datei bleiben', async () => {
    const { attachmentContext, turnMaterial } = await processAttachments(
      [textFile('notizen.txt')],
      'req-1'
    );
    expect(attachmentContext).toContain('### notizen.txt (Volltext-Auszug)\n');
    expect(kinds(turnMaterial)).toEqual(['upload']);
  });

  it('erkennt beides nebeneinander', async () => {
    const { turnMaterial } = await processAttachments(
      [textFile('notizen.txt'), textFile('Eingefügter Text.txt')],
      'req-1'
    );
    expect(kinds(turnMaterial)).toEqual(['upload', 'paste']);
  });

  it('führt eine Datei ohne lesbaren Text als Datei neben dem Paste', async () => {
    mockExtract
      .mockResolvedValueOnce({ text: '', pageCount: 1 })
      .mockResolvedValueOnce({ text: '12.01. Neujahrsempfang', pageCount: 1 });
    const { attachmentContext, turnMaterial } = await processAttachments(
      [textFile('scan.txt'), textFile('Eingefügter Text.txt')],
      'req-1'
    );
    expect(attachmentContext).toContain('### scan.txt\n\n[Kein Text erkannt]');
    expect(kinds(turnMaterial)).toEqual(['upload', 'paste']);
  });

  it('nimmt einen Upload, der nur so heisst, nicht für einen Paste', () => {
    expect(materialSectionHeading('Eingefügter Text.txt', 'application/pdf')).toBe(
      'Eingefügter Text.txt (Volltext-Auszug)'
    );
  });

  it('nennt einen früheren Paste als solchen, mit Voll- oder Kurzfassung', () => {
    expect(materialSectionHeading('Eingefügter Text.txt', 'text/plain', 'Volltext-Auszug')).toBe(
      'Eingefügter Text aus einer früheren Nachricht (Volltext-Auszug)'
    );
    expect(materialSectionHeading('bericht.pdf', 'application/pdf', 'Zusammenfassung')).toBe(
      'bericht.pdf (Zusammenfassung)'
    );
  });

  it('kürzt den Anfang eines Pastes an einer Wortgrenze', () => {
    expect(pasteOpening('kurz  und\n\nknapp')).toBe('kurz und knapp');
    const long =
      'es geht um den weltbodentag, dafür brauche ich ein forderungspapier für unsere bezirksgruppe';
    expect(pasteOpening(long)).toBe(
      'es geht um den weltbodentag, dafür brauche ich ein forderungspapier…'
    );
  });

  it('meldet für leeres Material nichts', async () => {
    const { attachmentContext, turnMaterial } = await processAttachments([], 'req-1');
    expect(attachmentContext).toBe('');
    expect(turnMaterial).toEqual([]);
  });
});
