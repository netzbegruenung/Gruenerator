import { describe, expect, it } from 'vitest';

import { sharepicSpecSchema } from './sharepicCreator.js';
import {
  sharepicBlockFileEntrySchema,
  sharepicBlockSpec,
  sharepicBlockThumbPath,
} from './sharepicVorlagen.js';

const entry = {
  id: 'de-block-frage',
  titel: 'Interviewfrage + Antwort',
  gruppe: 'text',
  color: 'hellgrau',
  items: [
    { type: 'frage', text: 'Wer soll das bezahlen?', von: 'Lokalzeitung' },
    { type: 'absatz', text: 'Wir alle – aber gerechter verteilt.' },
  ],
};

describe('sharepic Blöcke', () => {
  it('reads an entry and defaults its search words', () => {
    const parsed = sharepicBlockFileEntrySchema.parse(entry);
    expect(parsed.stichworte).toEqual([]);
  });

  it('holds one or two items', () => {
    expect(sharepicBlockFileEntrySchema.safeParse({ ...entry, items: [] }).success).toBe(false);
    const three = [...entry.items, { type: 'absatz', text: 'Noch einer.' }];
    expect(sharepicBlockFileEntrySchema.safeParse({ ...entry, items: three }).success).toBe(false);
  });

  it('composes as a valid one-slide spec of the country, in the format asked for', () => {
    const block = sharepicBlockFileEntrySchema.parse(entry);
    const spec = sharepicBlockSpec('de-DE', block, 'post-portrait-tall');
    expect(sharepicSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.format).toBe('post-portrait-tall');
    expect(spec.slides[0]!.logo).toBe(false);
    // Hellgrau is a DE colour only.
    expect(sharepicSpecSchema.safeParse(sharepicBlockSpec('de-AT', block)).success).toBe(false);
  });

  it('versions the preview URL', () => {
    expect(sharepicBlockThumbPath('de-block-frage', 'abc')).toBe(
      '/api/sharepic-vorlagen/bloecke/de-block-frage/thumb?v=abc'
    );
  });
});
