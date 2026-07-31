import { describe, expect, it } from 'vitest';

import {
  buildDocumentActions,
  filenameFromDisposition,
  messageTitle,
} from './messageDocumentActions';

describe('buildDocumentActions', () => {
  it('offers the editor and both plain downloads by default', () => {
    const ids = buildDocumentActions({
      hasLinkedDoc: false,
      canExportPdfLetterhead: false,
    }).map((action) => action.id);

    expect(ids).toEqual(['docs', 'docx', 'pdf']);
  });

  // Without an injected handler there is no dialog to choose an Absender in, so
  // the entry is absent above rather than present and broken.
  it('adds the letterhead PDF once the host can open the dialog', () => {
    const ids = buildDocumentActions({
      hasLinkedDoc: false,
      canExportPdfLetterhead: true,
    }).map((action) => action.id);

    expect(ids).toEqual(['docs', 'docx', 'pdf', 'pdf-letterhead']);
  });

  it('says "öffnen" once a document was created from this message', () => {
    const label = (hasLinkedDoc: boolean) =>
      buildDocumentActions({ hasLinkedDoc, canExportPdfLetterhead: false })[0].label;

    expect(label(false)).toBe('Im Editor bearbeiten');
    expect(label(true)).toBe('Im Editor öffnen');
  });
});

describe('messageTitle', () => {
  it('uses the first heading', () => {
    expect(messageTitle('## Leben und Karriere\n\nEin Absatz.')).toBe('Leben und Karriere');
  });

  it('falls back to the opening sentence and drops markdown syntax', () => {
    expect(messageTitle('**Marilyn Monroe** wurde 1926 geboren. Sie war Schauspielerin.')).toBe(
      'Marilyn Monroe wurde 1926 geboren.'
    );
  });

  it('caps the length and never returns an empty title', () => {
    expect(messageTitle('#'.repeat(3) + ' ' + 'a'.repeat(200)).length).toBe(60);
    expect(messageTitle('   ')).toBe('Chat-Nachricht');
  });
});

describe('filenameFromDisposition', () => {
  // The ASCII fallback replaces every Umlaut with `_`.
  it('prefers the RFC 5987 form over the ASCII one', () => {
    const header =
      'attachment; filename="Bedeutung f_r Gr_ne.pdf"; filename*=UTF-8\'\'Bedeutung%20f%C3%BCr%20Gr%C3%BCne.pdf';

    expect(filenameFromDisposition(header, 'pdf')).toBe('Bedeutung für Grüne.pdf');
  });

  it('falls back to the ASCII form and then to a default', () => {
    expect(filenameFromDisposition('attachment; filename="Bericht.docx"', 'docx')).toBe(
      'Bericht.docx'
    );
    expect(filenameFromDisposition(null, 'pdf')).toBe('chat-nachricht.pdf');
  });

  it('survives an undecodable percent sequence', () => {
    const header = 'attachment; filename="ok.pdf"; filename*=UTF-8\'\'%E0%A4%A';
    expect(filenameFromDisposition(header, 'pdf')).toBe('ok.pdf');
  });
});
