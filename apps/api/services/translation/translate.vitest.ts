/**
 * The glossary contract in one place: with an explicit source it is one call,
 * with "auto" it is one call unless a dictionary covers the DETECTED pair —
 * then a second call with the glossary and the now-explicit source. Billing is
 * the sum, and a failed glossary lookup never blocks the translation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { DEEPL_API_KEY: 'k', DEEPL_GLOSSARY_NAME: 'Grünerator', DEEPL_DAILY_CHARS_PER_USER: 1000 },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const assertQuota = vi.fn();
const settleQuota = vi.fn();
vi.mock('./translationQuota.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./translationQuota.js')>();
  return { ...mod, assertQuota, settleQuota };
});

const { translateWithGlossary, translationErrorMessage, TranslationUnavailableError } =
  await import('./translate.js');
const { DeepLError } = await import('./DeepLService.js');
const { TranslationQuotaExceededError } = await import('./translationQuota.js');

const translateText = vi.fn();
const service = { translateText } as unknown as import('./DeepLService.js').DeepLService;

const GLOSSARY = { glossaryId: 'g-1', pairs: ['de>en'] };
const glossary = vi.fn(async () => GLOSSARY);

const reply = (text: string, detected: string, billed: number) => [
  { text, detectedSourceLang: detected, billedCharacters: billed },
];

beforeEach(() => {
  translateText.mockReset();
  glossary.mockClear();
  assertQuota.mockReset().mockResolvedValue({ used: 0, limit: 1000 });
  settleQuota
    .mockReset()
    .mockImplementation(async (_u: string, n: number) => ({ used: n, limit: 1000 }));
});

describe('translateWithGlossary', () => {
  it('explicit source with a covered pair: one call, glossary attached', async () => {
    translateText.mockResolvedValueOnce(reply('Hello', 'de', 5));

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hallo', targetLang: 'en-GB', sourceLang: 'de', formality: 'more' },
      { service, glossary }
    );

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith({
      text: ['Hallo'],
      targetLang: 'en-GB',
      sourceLang: 'de',
      formality: 'more',
      glossaryId: 'g-1',
    });
    expect(result).toEqual({
      text: 'Hello',
      detectedSourceLang: 'de',
      targetLang: 'en-GB',
      billedCharacters: 5,
      glossaryApplied: true,
      quota: { used: 5, limit: 1000 },
    });
    expect(assertQuota).toHaveBeenCalledWith('u1', 5);
    expect(settleQuota).toHaveBeenCalledWith('u1', 5);
  });

  it('auto source, detected pair NOT covered: one call, no glossary', async () => {
    translateText.mockResolvedValueOnce(reply('Bonjour', 'en', 5));

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hello', targetLang: 'fr', sourceLang: 'auto' },
      { service, glossary }
    );

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText.mock.calls[0]?.[0]).not.toHaveProperty('glossaryId');
    expect(translateText.mock.calls[0]?.[0]).not.toHaveProperty('sourceLang');
    expect(result.glossaryApplied).toBe(false);
    expect(result.detectedSourceLang).toBe('en');
  });

  it('auto source, detected pair covered: second call with glossary + explicit source, billing summed', async () => {
    translateText
      .mockResolvedValueOnce(reply('Alliance 90', 'de', 12))
      .mockResolvedValueOnce(reply('Alliance 90/The Greens', 'de', 12));

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Bündnis 90', targetLang: 'en-US' },
      { service, glossary }
    );

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(translateText.mock.calls[1]?.[0]).toMatchObject({
      sourceLang: 'de',
      glossaryId: 'g-1',
      targetLang: 'en-US',
    });
    expect(result.text).toBe('Alliance 90/The Greens');
    expect(result.glossaryApplied).toBe(true);
    expect(result.billedCharacters).toBe(24);
    expect(settleQuota).toHaveBeenCalledWith('u1', 24);
  });

  it('translates without a glossary when the lookup throws', async () => {
    translateText.mockResolvedValueOnce(reply('Hello', 'de', 5));
    const broken = vi.fn(async () => {
      throw new DeepLError('DeepL 503: down', 503);
    });

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hallo', targetLang: 'en-GB', sourceLang: 'de' },
      { service, glossary: broken }
    );

    expect(result.glossaryApplied).toBe(false);
    expect(translateText.mock.calls[0]?.[0]).toMatchObject({ glossaryId: null });
  });

  it('stops before DeepL when the budget is exhausted', async () => {
    assertQuota.mockRejectedValueOnce(
      new TranslationQuotaExceededError({ used: 990, limit: 1000 })
    );

    await expect(
      translateWithGlossary(
        { userId: 'u1', text: 'Hallo Welt!', targetLang: 'en-GB' },
        { service, glossary }
      )
    ).rejects.toBeInstanceOf(TranslationQuotaExceededError);
    expect(translateText).not.toHaveBeenCalled();
  });

  it('reports the feature as unavailable without a service', async () => {
    await expect(
      translateWithGlossary({ userId: 'u1', text: 'x', targetLang: 'en-GB' }, { service: null })
    ).rejects.toBeInstanceOf(TranslationUnavailableError);
  });
});

describe('translationErrorMessage', () => {
  it('maps the known failures to German sentences', () => {
    expect(
      translationErrorMessage(new TranslationQuotaExceededError({ used: 1000, limit: 1000 }))
    ).toMatch(/Tagesbudget.*Morgen/);
    expect(translationErrorMessage(new DeepLError('DeepL 456: quota', 456))).toMatch(/Kontingent/);
    expect(translationErrorMessage(new DeepLError('DeepL 400: bad target', 400))).toMatch(
      /abgelehnt/
    );
    expect(translationErrorMessage(new DeepLError('DeepL 503: down', 503))).toMatch(
      /nicht erreichbar/
    );
    expect(translationErrorMessage(new TranslationUnavailableError())).toMatch(
      /nicht eingerichtet/
    );
    expect(translationErrorMessage(new Error('boom'))).toBe('Die Übersetzung ist fehlgeschlagen.');
  });
});
