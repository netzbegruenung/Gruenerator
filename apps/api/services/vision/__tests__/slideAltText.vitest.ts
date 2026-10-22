import { describe, expect, it, vi } from 'vitest';

import { buildSlideAltTextUserPrompt, cleanSlideAltText, describeSlides } from '../slideAltText.js';

describe('buildSlideAltTextUserPrompt', () => {
  it('lists the editor texts one per line, whitespace collapsed', () => {
    expect(buildSlideAltTextUserPrompt(['Faktencheck\nHeizung', '  ', 'Quelle: VCD'], 2, 5)).toBe(
      'Folie 2 von 5.\n\nTexte auf der Folie:\n- Faktencheck Heizung\n- Quelle: VCD'
    );
  });

  it('says so when the page has no text', () => {
    expect(buildSlideAltTextUserPrompt([], 1, 1)).toContain('Texte auf der Folie:\n(keine)');
  });
});

describe('cleanSlideAltText', () => {
  it('takes the tagged text and drops a period after a closed quote', () => {
    expect(
      cleanSlideAltText(
        'Hier ist er:\n<alt_text>\n„Daria pflegt ihre Mutter. Jeden Tag.“.\n</alt_text>'
      )
    ).toBe('„Daria pflegt ihre Mutter. Jeden Tag.“');
  });

  it('ends the text with a period, so the screen reader stops', () => {
    expect(cleanSlideAltText('„Bessere Luft.“ KI-Generiert mit dem Grünerator')).toBe(
      '„Bessere Luft.“ KI-Generiert mit dem Grünerator.'
    );
  });

  it('also after a colon at the end of a quote', () => {
    expect(cleanSlideAltText('„Seit Jahren gilt bei uns:“. „Ohne Auto …“')).toBe(
      '„Seit Jahren gilt bei uns:“ „Ohne Auto …“'
    );
  });

  it('keeps an untagged answer', () => {
    expect(cleanSlideAltText('„Zu teuer.“')).toBe('„Zu teuer.“');
  });
});

describe('describeSlides', () => {
  it('keeps page order and reports a failed page as null', async () => {
    const onError = vi.fn();
    const result = await describeSlides(
      ['a', 'b', 'c'],
      async (slide) => {
        if (slide === 'b') throw new Error('503');
        await new Promise((r) => setTimeout(r, slide === 'a' ? 10 : 0));
        return `Alt ${slide}`;
      },
      onError
    );
    expect(result).toEqual(['Alt a', null, 'Alt c']);
    expect(onError).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('runs at most four pages at once', async () => {
    let running = 0;
    let peak = 0;
    await describeSlides(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return 'x';
      },
      () => {}
    );
    expect(peak).toBe(4);
  });
});
