import { sharepicCreatorErrorSchema, type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { DraftFailedError, draftSharepic, validateDraft } from './draftAgent.js';
import { DRAFT_LIMIT_TEXTS, draftFailedBody, headlineLineTooLong } from './draftFailure.js';
import { formMismatch } from './forms.js';
import { systemPrompt } from './styleguide.js';

const LONG = 'Mehr Busse und Bahnen für alle Dörfer';

const slide = (lines: string[]) => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  logo: true,
  items: [{ type: 'headline', lines }],
});

const current: SharepicSpec = {
  locale: 'de-DE',
  slides: [slide(['Mehr Busse', 'für alle']) as SharepicSpec['slides'][number]],
};

describe('headline line limit', () => {
  it('tells the repair turn the limit and how to keep it', () => {
    const checked = validateDraft({ slides: [slide([LONG, 'jetzt'])] }, 'de-DE', LONG);
    expect(checked.ok).toBe(false);
    const error = checked.ok ? '' : checked.error;
    expect(error).toContain(
      `„${LONG}“ hat ${LONG.length} sichtbare Zeichen, erlaubt sind höchstens 24`
    );
    expect(error).toContain('verteile den Text auf mehr Zeilen');
    expect(error).not.toContain('String must contain');
  });

  it('states the limit in the prompt', () => {
    expect(systemPrompt('de-DE')).toContain('höchstens 24 Zeichen');
    expect(systemPrompt('de-AT')).toContain('höchstens 24 Zeichen');
  });

  describe('a draft that keeps breaking it', () => {
    beforeEach(() => {
      aiObject.mockReset();
      aiObject
        .mockResolvedValueOnce({
          ok: true,
          data: {
            land: 'de-DE',
            anlass: [],
            kapitel: [],
            fotos_suchen: [],
            form: 'einzelbild',
            alternativen: [],
          },
        })
        // Both rounds, Gemma's and the rescue model's.
        .mockImplementation((call: { validate: (input: unknown) => unknown }) => {
          const checked = call.validate({ slides: [slide([LONG])] }) as {
            ok: false;
            error: string;
          };
          return Promise.resolve({ ok: false, error: checked.error });
        });
    });

    it('fails with the limit as its reason', async () => {
      const failed = await draftSharepic(
        'Mach die erste Zeile viel länger',
        'de-DE',
        current
      ).catch((err: unknown) => err);
      expect(failed).toBeInstanceOf(DraftFailedError);
      expect((failed as DraftFailedError).reason).toBe('headline_line_too_long');
    });
  });

  it('names the limit for the person', () => {
    expect(DRAFT_LIMIT_TEXTS.headline_line_too_long).toContain(
      'Eine Headline-Zeile darf höchstens 24 Zeichen haben – ich kann den Text auf mehrere Zeilen verteilen oder kürzen.'
    );
  });
});

describe('draftFailedBody', () => {
  const tooLong = new DraftFailedError(headlineLineTooLong('Slide 1', LONG));

  it('carries the limit as a code and names it in the text', () => {
    expect(draftFailedBody(tooLong)).toEqual({
      error: `Der Entwurf ist nicht gelungen. ${DRAFT_LIMIT_TEXTS.headline_line_too_long}`,
      reason: 'headline_line_too_long',
    });
    expect(sharepicCreatorErrorSchema.parse(draftFailedBody(tooLong))).toEqual(
      draftFailedBody(tooLong)
    );
  });

  it('keeps the old body without a known limit', () => {
    expect(draftFailedBody(new DraftFailedError('slides.0.items.0.text: zu lang'))).toEqual({
      error:
        'Der Entwurf ist nicht gelungen. Formuliere den Auftrag etwas genauer und versuch es noch einmal.',
    });
  });
});

describe('carousel slide count', () => {
  it('fails with the range as its reason and names it for the person', () => {
    const one = { locale: 'de-DE' as const, slides: [current.slides[0]!] };
    const error = `Der Auftrag ist ein Sharepic der Form ${formMismatch('karussell', one, false)}`;
    expect(new DraftFailedError(error).reason).toBe('carousel_slide_count');
    expect(draftFailedBody(new DraftFailedError(error))).toEqual({
      error: `Der Entwurf ist nicht gelungen. ${DRAFT_LIMIT_TEXTS.carousel_slide_count}`,
      reason: 'carousel_slide_count',
    });
    expect(DRAFT_LIMIT_TEXTS.carousel_slide_count).toContain('Ein Karussell hat 2 bis 8 Folien');
  });
});

describe('headline line limit counts what the slide shows', () => {
  it('lets inline marks take no room', () => {
    const marked = 'Mehr ==Radwege== für eine';
    expect(marked.length).toBe(25);
    expect(validateDraft({ slides: [slide([marked])] }, 'de-DE', marked).ok).toBe(true);
  });

  it('still rejects 25 visible characters and counts them in the repair', () => {
    const long = '==Mehr Busse und Bahnen== jetzt';
    const checked = validateDraft({ slides: [slide([long])] }, 'de-DE', long);
    expect(checked.ok).toBe(false);
    expect(checked.ok ? '' : checked.error).toContain('hat 27 sichtbare Zeichen');
  });
});

describe('a request for one sharepic', () => {
  const needs = (form: string) => ({
    ok: true,
    data: { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [], form, alternativen: [] },
  });
  const three = { slides: [slide(['Eins']), slide(['Zwei']), slide(['Drei'])] };

  beforeEach(() => aiObject.mockReset());

  it('sends a carousel draft back for one slide and asks for it up front', async () => {
    let error = '';
    aiObject
      .mockResolvedValueOnce(needs('infografik'))
      .mockImplementationOnce((call: { prompt: string; validate: (i: unknown) => unknown }) => {
        expect(call.prompt).toContain('genau eine Slide');
        const checked = call.validate(three) as { ok: boolean; error: string };
        error = checked.error;
        return Promise.resolve({ ok: false, error });
      });
    await draftSharepic(
      'Sharepic zur Mitgliederwerbung',
      'de-DE',
      null,
      [],
      {},
      null,
      'Sharepic zur Mitgliederwerbung',
      null,
      null,
      true
    ).catch(() => null);
    expect(error).toContain('genau eine Slide');
    expect(aiObject.mock.calls[0]![0].prompt).toContain('kein Karussell');
  });

  it('turns a carousel pick into a single image', async () => {
    aiObject
      .mockResolvedValueOnce(needs('karussell'))
      .mockImplementationOnce((call: { prompt: string }) => {
        expect(call.prompt).toContain('Form: Einzelbild');
        return Promise.resolve({ ok: false, error: 'stop' });
      });
    await draftSharepic(
      'Sharepic zur Mitgliederwerbung',
      'de-DE',
      null,
      [],
      {},
      null,
      'Sharepic zur Mitgliederwerbung',
      null,
      null,
      true
    ).catch(() => null);
    // needs, the draft, and the rescue round on another model
    expect(aiObject).toHaveBeenCalledTimes(3);
  });

  it('leaves a carousel alone without the flag', () => {
    aiObject
      .mockResolvedValueOnce(needs('karussell'))
      .mockImplementationOnce((call: { validate: (i: unknown) => { ok: boolean } }) => {
        expect(call.validate(three).ok).toBe(true);
        return Promise.resolve({ ok: false, error: 'stop' });
      });
    return draftSharepic('Karussell zur Mitgliederwerbung', 'de-DE').catch(() => null);
  });
});
