/**
 * Thread titles are what the sidebar shows, so the two things pinned here are
 * WHICH text the title is derived from (the question, not the answer) and that
 * a sentence-shaped AI title never replaces a good fallback. Drizzle is faked
 * at the query level — the assertion is the title that reaches `set()`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Titles handed to db.update().set(), in order. */
const written: string[] = [];

function makeDb() {
  return {
    update: () => {
      const chain: Record<string, unknown> = {
        set: (values: { title?: string }) => {
          if (typeof values.title === 'string') written.push(values.title);
          return chain;
        },
        where: () => chain,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
      };
      return chain;
    },
  };
}

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => makeDb(),
}));

const { extractFallbackTitle, generateThreadTitle, normalizeAiTitle } =
  await import('./threadTitleService.js');

/** Minimal AI worker pool that answers with `content`, or rejects if null. */
function fakePool(content: string | null) {
  return {
    processRequest: vi.fn(() =>
      content === null ? Promise.reject(new Error('lane down')) : Promise.resolve({ content })
    ),
  } as never;
}

beforeEach(() => {
  written.length = 0;
});

describe('extractFallbackTitle', () => {
  it('keeps the title inside the sidebar width', () => {
    const title = extractFallbackTitle(
      'Fasse die Protokolle vom 30. Juni und 1. Juli der Fraktionssitzung zusammen'
    );
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(32);
  });

  it('cuts at a word boundary, without an ellipsis', () => {
    const title = extractFallbackTitle(
      'Analyse von Budget und Standortfragen der kommunalen Verwaltung'
    );
    expect(title).toBe('Analyse von Budget und');
  });

  it('strips politeness lead-ins so the topic stays visible', () => {
    expect(extractFallbackTitle('Kannst du mir bitte den Antrag zur Radinfrastruktur')).toBe(
      'den Antrag zur Radinfrastruktur'
    );
    expect(extractFallbackTitle('Bitte einen Timer auf 10 Minuten setzen')).toBe(
      'einen Timer auf 10 Minuten'
    );
  });

  it('skips salutations and takes the next sentence', () => {
    expect(extractFallbackTitle('Hallo! Wie hoch ist die Pendlerpauschale?')).toBe(
      'Wie hoch ist die'
    );
  });

  it('strips markdown and trailing sentence punctuation', () => {
    expect(extractFallbackTitle('**Kommunaler Klimaplan** 2027!')).toBe(
      'Kommunaler Klimaplan 2027'
    );
  });

  it('does not treat a German ordinal date as a sentence end', () => {
    expect(extractFallbackTitle('Protokoll vom 30. Juni. Und was folgt daraus?')).toBe(
      'Protokoll vom 30. Juni'
    );
  });

  it('accepts short questions that the old 10-character floor dropped', () => {
    expect(extractFallbackTitle('Timer setzen')).toBe('Timer setzen');
  });

  it('falls back to the image label and otherwise to null', () => {
    expect(extractFallbackTitle('', true)).toBe('Generiertes Bild');
    expect(extractFallbackTitle('')).toBeNull();
    expect(extractFallbackTitle('Hi')).toBeNull();
  });
});

describe('normalizeAiTitle', () => {
  it('accepts a short noun phrase', () => {
    expect(normalizeAiTitle('E-Auto-Förderung Stand')).toBe('E-Auto-Förderung Stand');
  });

  it('strips quotes, trailing punctuation and extra lines', () => {
    expect(normalizeAiTitle('"Protokolle Juni/Juli."')).toBe('Protokolle Juni/Juli');
    expect(normalizeAiTitle('Timer setzen\n\nSoll ich noch etwas tun?')).toBe('Timer setzen');
  });

  it('rejects sentence-shaped answers so the fallback survives', () => {
    expect(
      normalizeAiTitle('Hier ist eine ausführliche Zusammenfassung der letzten Fraktionssitzung')
    ).toBeNull();
    expect(normalizeAiTitle('Der Titel lautet: Klima. Passt das so für dich?')).toBeNull();
    expect(normalizeAiTitle('ok')).toBeNull();
    expect(normalizeAiTitle(null)).toBeNull();
  });
});

describe('generateThreadTitle', () => {
  const ANSWER =
    'Die Protokolle vom 30. Juni und 1. Juli behandeln vor allem den Haushaltsentwurf ' +
    'und die Standortfrage der neuen Kita.';

  it('derives the fallback from the question, not from the answer', async () => {
    await generateThreadTitle(
      't-1',
      'Fasse die Protokolle vom 30. Juni und 1. Juli zusammen',
      ANSWER,
      fakePool('Protokolle Juni/Juli')
    );

    expect(written[0]).toBe('Fasse die Protokolle vom 30.');
    expect(written[0]).not.toContain('behandeln');
  });

  it('upgrades the fallback once the AI title arrives', async () => {
    await generateThreadTitle(
      't-2',
      'Wie hoch ist die Pendlerpauschale?',
      ANSWER,
      fakePool('"Pendlerpauschale Höhe"')
    );

    await vi.waitFor(() => expect(written).toHaveLength(2));
    expect(written[1]).toBe('Pendlerpauschale Höhe');
  });

  it('keeps the fallback when the AI answers with a sentence', async () => {
    await generateThreadTitle(
      't-3',
      'Wie hoch ist die Pendlerpauschale?',
      ANSWER,
      fakePool('Hier ist ein passender Titel für diese Konversation über die Pendlerpauschale')
    );

    await vi.waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toBe('Wie hoch ist die');
  });

  it('keeps the fallback when the AI lane fails', async () => {
    await generateThreadTitle('t-4', 'Kommunaler Klimaplan 2027', ANSWER, fakePool(null));

    await vi.waitFor(() => expect(written).toEqual(['Kommunaler Klimaplan 2027']));
  });

  it('falls back to the answer when the question carries no usable text', async () => {
    await generateThreadTitle('t-5', '?', ANSWER, fakePool('Protokolle Juni/Juli'));

    expect(written[0]).toBe('Die Protokolle vom 30. Juni und');
  });
});
