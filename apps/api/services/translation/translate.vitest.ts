/**
 * The glossary contract in one place: with an explicit source it is one call,
 * with "auto" it is one call unless a dictionary covers the DETECTED pair —
 * then a second call with the glossary and the now-explicit source. Billing is
 * the sum, and a failed glossary lookup never blocks the translation.
 *
 * The budget is the second contract: booked on the text length before DeepL,
 * corrected to what DeepL billed, and handed back in full when the call fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
  type TreeBalance,
} from '../trees/treeBudget.js';
import { treeCostForChars } from '../trees/treeCosts.js';

vi.mock('../../config/env.js', () => ({
  env: { DEEPL_API_KEY: 'k', DEEPL_GLOSSARY_NAME: 'Grünerator' },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { translateWithGlossary, translationErrorMessage, TranslationUnavailableError } =
  await import('./translate.js');
const { DeepLError } = await import('./DeepLService.js');

const LIMIT_UNITS = 1500;
const RESETS_AT = new Date('2026-09-19T00:00:00.000Z');

/** Books like the real thing so the assertions can read the running total. */
function fakeBudget() {
  let used = 0;
  const balance = (): TreeBalance => ({
    usedUnits: used,
    limitUnits: LIMIT_UNITS,
    remainingUnits: LIMIT_UNITS - used,
    resetsAt: RESETS_AT,
    newsletterBonus: false,
  });
  return {
    usedUnits: () => used,
    reserveOrThrow: vi.fn(async (_userId: string, units: number) => {
      used += units;
      return balance();
    }),
    adjust: vi.fn(async (_userId: string, delta: number) => {
      used += delta;
      return balance();
    }),
    release: vi.fn(async (_userId: string, units: number) => {
      used -= units;
      return balance();
    }),
  };
}

let budget: ReturnType<typeof fakeBudget>;

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
  budget = fakeBudget();
});

describe('translateWithGlossary', () => {
  it('explicit source with a covered pair: one call, glossary attached', async () => {
    translateText.mockResolvedValueOnce(reply('Hello', 'de', 5));

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hallo', targetLang: 'en-GB', sourceLang: 'de', formality: 'more' },
      { service, glossary, budget }
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
      quota: {
        used: 0.01,
        limit: 15,
        remaining: 14.99,
        resetsAt: RESETS_AT.toISOString(),
        newsletterBonus: false,
      },
    });
    expect(budget.reserveOrThrow).toHaveBeenCalledWith('u1', treeCostForChars(5));
    expect(budget.usedUnits()).toBe(treeCostForChars(5));
  });

  it('auto source, detected pair NOT covered: one call, no glossary', async () => {
    translateText.mockResolvedValueOnce(reply('Bonjour', 'en', 5));

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hello', targetLang: 'fr', sourceLang: 'auto' },
      { service, glossary, budget }
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
      { service, glossary, budget }
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
    expect(budget.usedUnits()).toBe(treeCostForChars(24));
  });

  it('translates without a glossary when the lookup throws', async () => {
    translateText.mockResolvedValueOnce(reply('Hello', 'de', 5));
    const broken = vi.fn(async () => {
      throw new DeepLError('DeepL 503: down', 503);
    });

    const result = await translateWithGlossary(
      { userId: 'u1', text: 'Hallo', targetLang: 'en-GB', sourceLang: 'de' },
      { service, glossary: broken, budget }
    );

    expect(result.glossaryApplied).toBe(false);
    expect(translateText.mock.calls[0]?.[0]).toMatchObject({ glossaryId: null });
  });

  it('corrects the reservation by what DeepL really billed', async () => {
    const text = 'x'.repeat(20_000);
    translateText.mockResolvedValueOnce(reply('y', 'de', 40_000));

    await translateWithGlossary(
      { userId: 'u1', text, targetLang: 'en-GB', sourceLang: 'de' },
      { service, glossary, budget }
    );

    expect(budget.reserveOrThrow).toHaveBeenCalledWith('u1', 100);
    expect(budget.adjust).toHaveBeenCalledWith('u1', 100);
    expect(budget.usedUnits()).toBe(200);
  });

  it('hands the whole reservation back when DeepL throws', async () => {
    translateText.mockRejectedValueOnce(new DeepLError('DeepL 503: down', 503));

    await expect(
      translateWithGlossary(
        { userId: 'u1', text: 'Hallo Welt!', targetLang: 'en-GB', sourceLang: 'de' },
        { service, glossary, budget }
      )
    ).rejects.toBeInstanceOf(DeepLError);
    expect(budget.release).toHaveBeenCalledWith('u1', treeCostForChars(11));
    expect(budget.usedUnits()).toBe(0);
  });

  it('stops before DeepL when the budget is exhausted', async () => {
    budget.reserveOrThrow.mockRejectedValueOnce(
      new TreeBudgetExceededError(
        {
          usedUnits: LIMIT_UNITS,
          limitUnits: LIMIT_UNITS,
          remainingUnits: 0,
          resetsAt: RESETS_AT,
          newsletterBonus: false,
        },
        1
      )
    );

    await expect(
      translateWithGlossary(
        { userId: 'u1', text: 'Hallo Welt!', targetLang: 'en-GB' },
        { service, glossary, budget }
      )
    ).rejects.toBeInstanceOf(TreeBudgetExceededError);
    expect(translateText).not.toHaveBeenCalled();
  });

  it('reports the feature as unavailable without a service', async () => {
    await expect(
      translateWithGlossary(
        { userId: 'u1', text: 'x', targetLang: 'en-GB' },
        { service: null, budget }
      )
    ).rejects.toBeInstanceOf(TranslationUnavailableError);
  });
});

describe('translationErrorMessage', () => {
  it('maps the known failures to German sentences', () => {
    expect(
      translationErrorMessage(
        new TreeBudgetExceededError(
          {
            usedUnits: LIMIT_UNITS,
            limitUnits: LIMIT_UNITS,
            remainingUnits: 0,
            resetsAt: RESETS_AT,
            newsletterBonus: false,
          },
          1
        )
      )
    ).toMatch(/Tagesbudget von 15 Bäumen/);
    expect(translationErrorMessage(new TreeBudgetUnavailableError())).toMatch(
      /lässt sich gerade nicht prüfen/
    );
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
