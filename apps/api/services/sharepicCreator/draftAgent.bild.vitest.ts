import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic, validateDraft } from './draftAgent.js';

const STOCK = 'diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg';
type Bild = Extract<SharepicSpec['slides'][number]['items'][number], { type: 'bild' }>;
const withBild = (bild: Omit<Bild, 'type'>): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'oben',
      align: 'links',
      items: [
        { type: 'headline', lines: ['Mehr Wind', 'für alle'] },
        { type: 'bild', ...bild },
      ],
      logo: false,
    },
  ],
});
const strip = withBild({ quelle: STOCK, ausschnitt: 'streifen-unten', filter: 'gruen' });
const person = withBild({ quelle: STOCK, ausschnitt: 'freigestellt', filter: 'gruen' });
const withoutLocale = (spec: SharepicSpec) => ({ slides: spec.slides });

describe('validateDraft — bild', () => {
  it('accepts a stock photo from the catalogue and rejects an unknown one', () => {
    expect(validateDraft(withoutLocale(strip), 'de-DE', 'Wind').ok).toBe(true);
    const unknown = withBild({ quelle: 'erfunden.jpg', ausschnitt: 'karte', filter: 'grau' });
    const checked = validateDraft(withoutLocale(unknown), 'de-DE', 'Wind');
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.error).toContain('erfunden.jpg');
  });

  it('takes an own photo only when the request brought it', () => {
    const own = withBild({ quelle: 'upload:1', ausschnitt: 'kreis', filter: 'original' });
    expect(validateDraft(withoutLocale(own), 'de-DE', 'Wind').ok).toBe(false);
    expect(validateDraft(withoutLocale(own), 'de-DE', 'Wind', ['upload:1']).ok).toBe(true);
    const cutOwn = withBild({ quelle: 'upload:1', ausschnitt: 'freigestellt', filter: 'gruen' });
    expect(validateDraft(withoutLocale(cutOwn), 'de-DE', 'Wind', ['upload:1']).ok).toBe(false);
  });

  it('leaves the cut-out to the server', () => {
    const cut = withBild({
      quelle: STOCK,
      ausschnitt: 'freigestellt',
      filter: 'gruen',
      freisteller: 'ki:erfunden-0000000000',
    });
    expect(validateDraft(withoutLocale(cut), 'de-DE', 'Wind').ok).toBe(false);
    expect(
      validateDraft(withoutLocale(cut), 'de-DE', 'Wind', [], ['ki:erfunden-0000000000']).ok
    ).toBe(true);
  });
});

function answer(draft: SharepicSpec) {
  aiObject.mockReset();
  aiObject
    .mockResolvedValueOnce({
      ok: true,
      data: { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [] },
    })
    .mockImplementationOnce(
      async (call: {
        validate: (input: unknown, attempt: number, attempts: number) => unknown;
      }) => {
        const checked = call.validate(withoutLocale(draft), 1, 1) as
          { ok: true; value: unknown } | { ok: false; error: string };
        return checked.ok ? { ok: true, data: checked.value } : checked;
      }
    );
}
const bildOf = (spec: SharepicSpec) => spec.slides[0]!.items.find((i) => i.type === 'bild')!;

describe('draftSharepic — freigestellt', () => {
  it('cuts the photo out once and carries the cut-out', async () => {
    answer(person);
    const cutOut = vi.fn(async () => 'ki:freisteller-000000001');
    const { spec, hinweis } = await draftSharepic('Wind', 'de-DE', null, [], { cutOut });
    expect(cutOut).toHaveBeenCalledWith(STOCK);
    expect(bildOf(spec)).toMatchObject({ freisteller: 'ki:freisteller-000000001' });
    expect(hinweis).toBeUndefined();
  });

  it('keeps the photo uncut and says so when cutting fails', async () => {
    answer(person);
    const { spec, hinweis } = await draftSharepic('Wind', 'de-DE', null, [], {
      cutOut: async () => null,
    });
    expect(bildOf(spec)).not.toHaveProperty('freisteller');
    expect(hinweis).toContain('freistellen');
  });

  it('cuts nothing for another ausschnitt, and credits the stock photo', async () => {
    answer(strip);
    const cutOut = vi.fn(async () => 'ki:freisteller-000000001');
    const { spec, attributions } = await draftSharepic('Wind', 'de-DE', null, [], { cutOut });
    expect(cutOut).not.toHaveBeenCalled();
    expect(bildOf(spec)).not.toHaveProperty('freisteller');
    expect(attributions[0]?.photographer).toBeTruthy();
  });
});
