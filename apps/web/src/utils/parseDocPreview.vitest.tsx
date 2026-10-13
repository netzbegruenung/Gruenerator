import { describe, expect, it } from 'vitest';

import { parseDocPreview } from './parseDocPreview';

describe('parseDocPreview', () => {
  it('takes the first heading as title and the rest as body', () => {
    expect(parseDocPreview('<h1>Titel</h1><p>Erster   Absatz</p><p>Zweiter</p>')).toEqual({
      heading: 'Titel',
      body: 'Erster AbsatzZweiter',
    });
  });

  it('falls back to a leading bold run as heading', () => {
    expect(parseDocPreview('<p><strong>Presse</strong></p><p>Text</p>')).toEqual({
      heading: 'Presse',
      body: 'Text',
    });
  });
});
