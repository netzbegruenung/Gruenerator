import { describe, expect, it } from 'vitest';

import { filenameFromDisposition } from './downloadOriginal';

describe('filenameFromDisposition', () => {
  it('prefers the UTF-8 form Express writes for non-ASCII names', () => {
    expect(
      filenameFromDisposition(
        `attachment; filename="Antrag_Gr_nfl_che.pdf"; filename*=UTF-8''Antrag%20Gr%C3%BCnfl%C3%A4che.pdf`
      )
    ).toBe('Antrag Grünfläche.pdf');
  });

  it('falls back to the plain form, then to null', () => {
    expect(filenameFromDisposition('attachment; filename="plan.docx"')).toBe('plan.docx');
    expect(filenameFromDisposition('attachment')).toBeNull();
    expect(filenameFromDisposition(undefined)).toBeNull();
  });
});
