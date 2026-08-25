/**
 * Das Prädikat, das zwei Entscheidungen trägt — Werkzeugmontage und
 * Loop-Routing. Vor dem 24.08.2026 hatte jede ihre eigene Kopie, und beide
 * prüften nur den MIME-Typ.
 */
import { describe, it, expect } from 'vitest';

import { hasReachableForm, selectPdfFormAttachments } from './pdfFormAvailability.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const attachment = (over: Partial<ThreadAttachment> = {}) =>
  ({
    id: 'a1',
    name: 'Datei.pdf',
    mimeType: 'application/pdf',
    isImage: false,
    extractedText: null,
    documentId: null,
    summary: null,
    hasFileData: false,
    createdAt: new Date(0),
    ...over,
  }) as ThreadAttachment;

describe('hasReachableForm', () => {
  it('sagt nein zu einem PDF, dessen Bytes nicht aufgehoben wurden', () => {
    // `isFillablePdf` hat es beim Upload verworfen — `file_data` blieb leer,
    // und `getThreadPdfFiles` fände es nie.
    expect(hasReachableForm({ threadAttachments: [attachment()] })).toBe(false);
  });

  it('sagt ja zu einem PDF aus einem früheren Turn, dessen Bytes liegen', () => {
    expect(hasReachableForm({ threadAttachments: [attachment({ hasFileData: true })] })).toBe(true);
  });

  it('sagt ja zu einem PDF dieses Turns — die Liste ist bereits gefiltert', () => {
    // Auf dem allerersten Turn („hier ist mein Formular") steht in der DB noch
    // nichts — dafür gibt es `pdfFormAttachments` überhaupt. Seit #2835 baut
    // `streamContext` die Liste über `selectPdfFormAttachments`, also nur aus
    // PDFs mit bestandener Upload-Prüfung; das Prädikat darf ihr vertrauen.
    expect(
      hasReachableForm({
        pdfFormAttachments: [{ name: 'Formular.pdf', data: 'AAAA' }],
        threadAttachments: [],
      })
    ).toBe(true);
  });

  it('lässt sich von einem Nicht-PDF mit Bytes nicht täuschen', () => {
    // Tabellarische Anhänge tragen ihre Bytes ebenfalls (Reload-Compute) — der
    // MIME-Typ bleibt also nötig, er genügt nur nicht allein.
    expect(
      hasReachableForm({
        threadAttachments: [
          attachment({
            name: 'Zahlen.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            hasFileData: true,
          }),
        ],
      })
    ).toBe(false);
  });

  it('kommt mit einem leeren Turn zurecht', () => {
    expect(hasReachableForm({})).toBe(false);
  });

  it('findet das Formular auch neben einem PDF ohne Bytes', () => {
    expect(
      hasReachableForm({
        threadAttachments: [attachment(), attachment({ id: 'a2', hasFileData: true })],
      })
    ).toBe(true);
  });
});

const meta = (over: Partial<ProcessedAttachmentMeta> = {}): ProcessedAttachmentMeta => ({
  name: 'Datei.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  isImage: false,
  extractedText: null,
  ...over,
});

describe('selectPdfFormAttachments', () => {
  const form = { name: 'Antrag.pdf', type: 'application/pdf', data: 'Zm9ybQ==' };
  const brochure = { name: 'Datenschutz.pdf', type: 'application/pdf', data: 'ZG9j' };

  it('behält das Formular und wirft das Nicht-Formular-PDF raus (#2835)', () => {
    const picked = selectPdfFormAttachments(
      [form, brochure],
      [
        meta({ name: 'Antrag.pdf', pdfIsFillable: true }),
        meta({ name: 'Datenschutz.pdf', pdfIsFillable: false }),
      ]
    );
    expect(picked).toEqual([{ name: 'Antrag.pdf', data: 'Zm9ybQ==' }]);
  });

  it('behält ein übergrosses Formular, dessen Bytes NICHT persistiert wurden', () => {
    // `pdfIsFillable` ist vom Grössendeckel der Persistenz entkoppelt: in
    // DIESEM Turn liegen die Bytes im Request, das Ausfüllen muss gehen —
    // erst auf Folge-Turns fehlt das PDF mangels `file_data`.
    const oversized = meta({ name: 'Antrag.pdf', pdfIsFillable: true });
    expect(oversized.fileData).toBeUndefined();
    const picked = selectPdfFormAttachments([form], [oversized]);
    expect(picked).toHaveLength(1);
  });

  it('lässt ein PDF ohne Urteil nicht durch (fail-closed wie die Prüfung selbst)', () => {
    expect(selectPdfFormAttachments([form], [meta({ name: 'Antrag.pdf' })])).toEqual([]);
  });

  it('lässt sich von einem gleichnamigen Nicht-PDF nicht täuschen', () => {
    const picked = selectPdfFormAttachments(
      [{ name: 'Antrag.pdf', type: 'text/plain', data: 'dHh0' }],
      [meta({ name: 'Antrag.pdf', pdfIsFillable: true })]
    );
    expect(picked).toEqual([]);
  });
});
