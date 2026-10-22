import { describe, expect, it } from 'vitest';

import { slideAltText } from './slideAltText';

describe('slideAltText', () => {
  it('reads canvas text rather than the stale creator spec', () => {
    expect(
      slideAltText(
        {
          creatorSpec: { slides: [{ text: 'Stale text' }] },
          additionalTexts: [
            { text: 'Neue ==Radwege==\nfür alle' },
            { text: 'Unsichtbar', opacity: 0 },
          ],
        },
        1,
        3
      )
    ).toBe('Karussell-Folie 2 von 3: Neue Radwege für alle');
  });

  it('includes the visible legacy slider fields', () => {
    expect(
      slideAltText(
        {
          slideVariant: 'content',
          label: 'Hidden label',
          headline: 'Radwege',
          subtext: 'Sicher unterwegs',
          subtext2: 'Für alle',
        },
        0,
        2
      )
    ).toBe('Karussell-Folie 1 von 2: Radwege Sicher unterwegs Für alle');
  });

  it('falls back to position for image-only and malformed legacy pages', () => {
    expect(slideAltText({ additionalTexts: [null, 42, { text: null }], headline: 3 }, 2, 3)).toBe(
      'Karussell-Folie 3 von 3'
    );
  });
});
