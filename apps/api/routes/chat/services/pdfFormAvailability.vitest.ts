/**
 * Das Prädikat, das zwei Entscheidungen trägt — Werkzeugmontage und
 * Loop-Routing. Vor dem 24.08.2026 hatte jede ihre eigene Kopie, und beide
 * prüften nur den MIME-Typ.
 */
import { describe, it, expect } from 'vitest';

import { hasReachableForm } from './pdfFormAvailability.js';

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

  it('sagt ja zu JEDEM PDF dieses Turns, auch einem ungeprüften', () => {
    // Auf dem allerersten Turn („hier ist mein Formular") steht in der DB noch
    // nichts — dafür gibt es `pdfFormAttachments` überhaupt. Die Liste ist
    // ungefiltert (streamContext), diese Hälfte also bewusst nicht streng: die
    // Bytes liegen vor, `read_pdf_form` prüft selbst und meldet `fieldCount: 0`.
    // Festgehalten, damit die Ungleichheit der beiden Hälften eine Zusicherung
    // hat und nicht nur einen Kommentar.
    expect(
      hasReachableForm({
        pdfFormAttachments: [{ name: 'Irgendein.pdf', data: 'AAAA' }],
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
