import { describe, expect, it } from 'vitest';

import { DocumentReadError, NO_TEXT_MESSAGE, processingErrorMessage } from './processingError.js';

describe('processingErrorMessage', () => {
  it('zeigt eine für Menschen geschriebene Meldung unverändert', () => {
    expect(processingErrorMessage(new DocumentReadError('Die Wolke-Freigabe ist weg.'))).toBe(
      'Die Wolke-Freigabe ist weg.'
    );
  });

  it('verrät bei einem Anbieterfehler weder Anbieter noch Rumpf', () => {
    const raw = new Error(
      'Mistral OCR extraction failed: API error occurred: Status 400 Body: {"object":"error","message":"Invalid image"}'
    );
    const message = processingErrorMessage(raw);
    expect(message).not.toMatch(/Mistral|Status|\{/);
    expect(message).toContain('konnte nicht gelesen werden');
  });

  it('sagt bei einem Ausfall, dass es später wieder gehen kann', () => {
    const outage = Object.assign(new Error('Service unavailable'), { statusCode: 503 });
    expect(processingErrorMessage(outage)).toContain('Neu indexieren');
  });

  it('macht aus „kein Text erkannt" des OCR-Anbieters die Kein-Text-Meldung', () => {
    expect(
      processingErrorMessage(
        new Error('Mistral OCR extraction failed: No text extracted from document')
      )
    ).toBe(NO_TEXT_MESSAGE);
  });

  it('fällt bei Nicht-Errors nicht um', () => {
    expect(processingErrorMessage('kaputt')).toContain('konnte nicht gelesen werden');
  });
});
