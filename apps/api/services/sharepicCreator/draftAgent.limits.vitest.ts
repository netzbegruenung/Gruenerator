import { sharepicCreatorErrorSchema, type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { DraftFailedError, draftSharepic, validateDraft } from './draftAgent.js';
import { DRAFT_LIMIT_TEXTS, draftFailedBody } from './draftFailure.js';
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
        .mockImplementationOnce((call: { validate: (input: unknown) => unknown }) => {
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
  it('carries the limit as a code and names it in the text', () => {
    expect(draftFailedBody('headline_line_too_long')).toEqual({
      error: `Der Entwurf ist nicht gelungen. ${DRAFT_LIMIT_TEXTS.headline_line_too_long}`,
      reason: 'headline_line_too_long',
    });
    expect(sharepicCreatorErrorSchema.parse(draftFailedBody('headline_line_too_long'))).toEqual(
      draftFailedBody('headline_line_too_long')
    );
  });

  it('keeps the old body without a known limit', () => {
    expect(draftFailedBody(null)).toEqual({
      error:
        'Der Entwurf ist nicht gelungen. Formuliere den Auftrag etwas genauer und versuch es noch einmal.',
    });
  });
});

describe('carousel slide count', () => {
  it('fails with the range as its reason and names it for the person', () => {
    const two = { locale: 'de-DE' as const, slides: [current.slides[0]!, current.slides[0]!] };
    const error = `Der Auftrag ist ein Sharepic der Form ${formMismatch('karussell', two, false)}`;
    expect(new DraftFailedError(error).reason).toBe('carousel_slide_count');
    expect(draftFailedBody('carousel_slide_count')).toEqual({
      error: `Der Entwurf ist nicht gelungen. ${DRAFT_LIMIT_TEXTS.carousel_slide_count}`,
      reason: 'carousel_slide_count',
    });
    expect(DRAFT_LIMIT_TEXTS.carousel_slide_count).toContain('Ein Karussell hat 3 bis 8 Folien');
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
