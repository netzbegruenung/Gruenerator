import { sharepicCreatorErrorSchema, type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { DraftFailedError, draftSharepic, validateDraft } from './draftAgent.js';
import { DRAFT_LIMIT_TEXTS, draftFailedBody } from './draftFailure.js';
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
    expect(error).toContain(`„${LONG}“ hat ${LONG.length} Zeichen, erlaubt sind höchstens 24`);
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
