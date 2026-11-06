/**
 * Feed teaser from `full_text` (#5433). Fixtures are article starts from the
 * live `landesverbaende_documents` corpus (07.11.2026).
 *
 * Run: `npx vitest run services/monitor/feedExcerpt.vitest.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildFeedExcerpt } from './feedExcerpt.js';

const MAX = 500;

describe('buildFeedExcerpt', () => {
  it('drops a title line (Grüne Fraktion Hessen)', () => {
    const text =
      'Jüdisches Leben sichtbar machen\n\nEröffnung der Jüdischen Akademie\n\nMathias Wagner, Fraktionsvorsitzender:';
    expect(buildFeedExcerpt(text, 'Jüdisches Leben sichtbar machen', MAX)).toBe(
      'Eröffnung der Jüdischen Akademie Mathias Wagner, Fraktionsvorsitzender:'
    );
  });

  it('drops a title repeated twice (Grüne Fraktion Sachsen-Anhalt)', () => {
    const text =
      'Rückschlag bei Kraftwerkszuschlägen\nRückschlag bei Kraftwerkszuschlägen\n\nBund lässt Schkopau hängen.';
    expect(buildFeedExcerpt(text, 'Rückschlag bei Kraftwerkszuschlägen', MAX)).toBe(
      'Bund lässt Schkopau hängen.'
    );
  });

  it('drops leading date and photo-credit lines', () => {
    expect(buildFeedExcerpt('29. Oktober 2026\n\nUnternehmen müssen planen.', 'X', MAX)).toBe(
      'Unternehmen müssen planen.'
    );
    expect(buildFeedExcerpt('03.11.26 –\n\nJette Gunkel ist neu.', 'X', MAX)).toBe(
      'Jette Gunkel ist neu.'
    );
    expect(
      buildFeedExcerpt('Foto: Grüne Fraktion Berlin\n\nZur Finanzabsage der EXPO.', 'X', MAX)
    ).toBe('Zur Finanzabsage der EXPO.');
  });

  it('keeps text when the title is only a truncated prefix (Instagram caption)', () => {
    const text =
      'Menschen, die von Energiearmut betroffen sind, müssen oft an anderen lebensnotwendigen Dingen wie Lebensmitteln sparen.';
    expect(
      buildFeedExcerpt(
        text,
        'Menschen, die von Energiearmut betroffen sind, müssen oft an anderen lebensnotwendigen Dingen wie L…',
        MAX
      )
    ).toBe(text);
  });

  it('returns null when the text is only the title', () => {
    const t = 'Vibest du heut auch mal wieder mit der (Welt-)Politik? 💪🫶🥰';
    expect(buildFeedExcerpt(t, t, MAX)).toBeNull();
  });

  it('cuts at the last full sentence within the budget', () => {
    const sentence = 'Das ist ein vollständiger Satz mit etwas Inhalt. ';
    const text = sentence.repeat(15);
    const out = buildFeedExcerpt(text, null, MAX);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(MAX);
    expect(out!.endsWith('Inhalt.')).toBe(true);
  });

  it('keeps a closing quote with the sentence', () => {
    const text = `${'a'.repeat(300)} „Das ist gesagt.“ ${'b '.repeat(200)}`;
    expect(buildFeedExcerpt(text, null, MAX)!.endsWith('gesagt.“')).toBe(true);
  });

  it('falls back to a word boundary with an ellipsis when no sentence ends late enough', () => {
    const text = `Kurz. ${'wort '.repeat(200)}`;
    const out = buildFeedExcerpt(text, null, MAX)!;
    expect(out.length).toBeLessThanOrEqual(MAX);
    expect(out.endsWith('wort…')).toBe(true);
  });
});
