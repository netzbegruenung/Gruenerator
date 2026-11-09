import { type SharepicSpec, type SharepicVariant } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftFailedError } from '../../../../services/sharepicCreator/draftAgent.js';
import { headlineLineTooLong } from '../../../../services/sharepicCreator/draftFailure.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  revise: vi.fn(),
  last: vi.fn(),
  vorlage: vi.fn(),
  photosForTurn: vi.fn(),
}));

vi.mock('../sharepicCreatorVariant.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sharepicCreatorVariant.js')>()),
  createCreatorSharepic: mocks.create,
  reviseCreatorSharepic: mocks.revise,
}));
vi.mock('../sharepicVariantHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sharepicVariantHelpers.js')>()),
  getLastSharepicVariant: mocks.last,
}));
vi.mock('../../../../services/sharepicVorlagen/catalog.js', () => ({
  getSharepicVorlage: mocks.vorlage,
}));
vi.mock('../sharepicTurnPhotos.js', () => ({ photosForTurn: mocks.photosForTurn }));
vi.mock('../threadPersistenceService.js', () => ({
  getRecentThreadSources: () => Promise.resolve([]),
}));

import { legacySharepicText, runSharepicGeneration } from './sharepic.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { PriorSharepic } from '../sharepicVariantHelpers.js';

const SPEC: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};

const CREATOR_PRIOR: PriorSharepic = {
  variantId: 'v1',
  canvasType: 'freeform',
  props: { creatorSpec: SPEC, attributions: [null] },
  canvasId: null,
};
const LEGACY_PRIOR: PriorSharepic = {
  variantId: 'v0',
  canvasType: 'dreizeilen',
  props: { line1: 'Mehr', line2: 'Radwege', line3: 'jetzt' },
  canvasId: null,
};
const DRAFT: SharepicVariant = {
  id: 'new',
  canvasType: 'freeform',
  initialProps: { creatorSpec: SPEC, attributions: [null] },
};

const REVISED: SharepicVariant = {
  id: 'rev',
  canvasType: 'freeform',
  initialProps: {
    creatorSpec: {
      ...SPEC,
      slides: [{ ...SPEC.slides[0]!, items: [{ type: 'headline', lines: ['Busse!'] }] }],
    },
    attributions: [null],
    revisionOf: 'v1',
  },
};

function state(text: string): ChatGraphState {
  return { messages: [{ role: 'user', content: text }], userLocale: 'de-DE' } as never;
}

function run(text: string, refinement?: { instruction: string; prior: PriorSharepic }) {
  const send = vi.fn();
  const done = runSharepicGeneration({
    state: state(text),
    sse: { send } as unknown as SSEWriter,
    threadId: 't1',
    ...(refinement && { sharepicRefinement: refinement }),
  });
  return { send, done };
}

describe('runSharepicGeneration', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.photosForTurn.mockResolvedValue({ photos: [], bericht: [] });
    mocks.create.mockResolvedValue(DRAFT);
    mocks.revise.mockResolvedValue(DRAFT);
  });

  it('turns a refinement of a legacy template sharepic into a fresh creator draft', async () => {
    const { done } = run('kürzer', { instruction: 'kürzer', prior: LEGACY_PRIOR });
    expect((await done).variants).toEqual([DRAFT]);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'kürzer\n\nThema wie beim vorigen Sharepic: Mehr Radwege jetzt',
        avoid: null,
        locale: 'de-DE',
        request: 'kürzer',
      })
    );
    expect(mocks.revise).not.toHaveBeenCalled();
  });

  it('falls back to the topic text when the legacy prior carries no text', async () => {
    const { done } = run('kürzer', {
      instruction: 'kürzer',
      prior: { ...LEGACY_PRIOR, props: {} },
    });
    await done;
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ brief: 'kürzer' }));
  });

  it('revises a creator sharepic from its spec', async () => {
    mocks.revise.mockResolvedValue(REVISED);
    const { send, done } = run('Headline kürzer', {
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
    });
    expect((await done).variants).toEqual([REVISED]);
    expect(mocks.revise).toHaveBeenCalledWith({
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
      spec: SPEC,
      userId: null,
      photos: [],
      photoBericht: [],
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('sharepic_complete', {
      message: 'Sharepic entworfen',
      variants: [REVISED],
    });
  });

  // Live 11.10.2026: „Mach die Schrift weiß" kam als Kopie mit „Überarbeitet" zurück.
  it('shows no card when the revision left the spec unchanged', async () => {
    const { send, done } = run('Mach die Schrift weiß', {
      instruction: 'Mach die Schrift weiß',
      prior: CREATOR_PRIOR,
    });
    expect(await done).toEqual({ variants: [], failure: 'unchanged' });
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({ variants: [], error: 'Sharepic unchanged' })
    );
  });

  it('drafts an alternative that avoids the prior layout', async () => {
    const { done } = run('mach eine ganz andere Variante', {
      instruction: 'mach eine ganz andere Variante',
      prior: CREATOR_PRIOR,
    });
    await done;
    expect(mocks.revise).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avoid: SPEC,
        brief: expect.stringContaining('Busse statt Stau') as unknown,
      })
    );
  });

  it('drafts a fresh sharepic with nothing to avoid', async () => {
    const { done } = run('Sharepic über Busse auf dem Land');
    await done;
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avoid: null,
        locale: 'de-DE',
        request: 'Sharepic über Busse auf dem Land',
      })
    );
    expect(mocks.last).not.toHaveBeenCalled();
  });

  // The creator's model reads the order from these words (live 09.11.2026: „Karussell …
  // bei allen Terminen" was held to a Terminübersicht by a word list).
  it.each([
    'Mach ein Zitat-Sharepic über Busse auf dem Land',
    'Insta-Karussell: Wir waren bei allen Terminen im Stadtrat',
    'erstelle 3 sharepics zur Mitgliederwerbung',
  ])('hands the words to the creator instead of guessing a form: %s', async (text) => {
    const { done } = run(text);
    await done;
    const args = mocks.create.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(args.request).toBe(text);
    expect(args.form).toBeNull();
  });

  it('defaults a fresh chat draft to one slide when the words leave it open', async () => {
    const { done } = run('erstelle ein sharepic um neue mitglieder für die grünen zu werben');
    await done;
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ oneSlide: true }));
  });

  it("reads form and slide count from the person's words, not the planner's text", async () => {
    const send = vi.fn();
    await runSharepicGeneration({
      state: state('Karussell: Mitglieder werben, Fakten zur Mitgliederzahl'),
      sse: { send } as unknown as SSEWriter,
      threadId: 't1',
      request: 'erstelle ein sharepic zur mitgliederwerbung',
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        request: 'erstelle ein sharepic zur mitgliederwerbung',
        brief: 'Karussell: Mitglieder werben, Fakten zur Mitgliederzahl',
        oneSlide: true,
      })
    );
  });

  it('lets an alternative to a carousel stay several slides', async () => {
    const carousel = { ...SPEC, slides: [SPEC.slides[0]!, SPEC.slides[0]!, SPEC.slides[0]!] };
    const { done } = run('mach eine ganz andere Variante', {
      instruction: 'mach eine ganz andere Variante',
      prior: { ...CREATOR_PRIOR, props: { creatorSpec: carousel, attributions: [null] } },
    });
    await done;
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ oneSlide: false }));
  });

  it('drafts an offered alternative in its form', async () => {
    const { done } = run('Andere Variante als Karussell', {
      instruction: 'Andere Variante als Karussell',
      prior: CREATOR_PRIOR,
    });
    await done;
    expect(mocks.revise).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avoid: SPEC,
        request: 'Andere Variante als Karussell',
        form: 'karussell',
      })
    );
  });

  it.each(['Andere Variante als Termine', 'Andere Variante als Große Zahl'])(
    'takes every chip text as its pick: %s',
    async (text) => {
      const { done } = run(text, { instruction: text, prior: CREATOR_PRIOR });
      await done;
      const args = mocks.create.mock.calls.at(-1)![0] as { form: string | null };
      expect(args.form).not.toBeNull();
    }
  );

  it.each([
    'Mach eine andere Variante als Karussell, aber kürzer',
    'Insta-Karussell: Wir waren bei allen Terminen',
    'andere variante als karussell bitte',
  ])('leaves typed words to the creator: %s', async (text) => {
    const { done } = run(text);
    await done;
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ form: null }));
  });

  it('puts the draft-failed hint where the client shows it', async () => {
    mocks.revise.mockRejectedValue(new DraftFailedError('no valid spec'));
    const { send, done } = run('Headline kürzer', {
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
    });
    const result = await done;
    expect(result.variants).toEqual([]);
    expect(result.failure).toBeInstanceOf(DraftFailedError);
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({
        variants: [],
        message: expect.stringContaining('Formuliere die Änderung etwas genauer') as unknown,
      })
    );
  });

  it('asks for a clearer order when a fresh draft fails', async () => {
    mocks.create.mockRejectedValue(new DraftFailedError('no valid spec'));
    const { send, done } = run('Sharepic über Busse auf dem Land');
    const result = await done;
    expect(result.variants).toEqual([]);
    expect(result.failure).toBeInstanceOf(DraftFailedError);
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({
        variants: [],
        message: expect.stringContaining('Formuliere den Auftrag etwas genauer') as unknown,
      })
    );
  });

  it('names the limit a failed revision kept breaking', async () => {
    mocks.revise.mockRejectedValue(
      new DraftFailedError(
        headlineLineTooLong('slides.0.items.0.lines.0', 'Viel zu lange erste Zeile hier')
      )
    );
    const { send, done } = run('Mach die erste Zeile viel länger', {
      instruction: 'Mach die erste Zeile viel länger',
      prior: CREATOR_PRIOR,
    });
    const result = await done;
    expect(result.variants).toEqual([]);
    expect(result.failure).toBeInstanceOf(DraftFailedError);
    expect((result.failure as DraftFailedError).reason).toBe('headline_line_too_long');
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({
        variants: [],
        message: expect.stringContaining('höchstens 24 Zeichen') as unknown,
      })
    );
  });
});

describe('runSharepicGeneration with a picked Vorlage', () => {
  const VORLAGE = { id: 'alt-zitat', titel: 'Zitat mit Foto', locale: 'de-DE', spec: SPEC };

  function runWith(
    messages: { role: string; content: string }[],
    vorlageId: string,
    refinement?: { instruction: string; prior: PriorSharepic }
  ) {
    const send = vi.fn();
    const done = runSharepicGeneration({
      state: { messages, userLocale: 'de-DE', sharepicVorlageId: vorlageId } as never,
      sse: { send } as unknown as SSEWriter,
      threadId: 't1',
      ...(refinement && { sharepicRefinement: refinement }),
    });
    return { send, done };
  }

  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.photosForTurn.mockResolvedValue({ photos: [], bericht: [] });
    mocks.create.mockResolvedValue(DRAFT);
    mocks.vorlage.mockImplementation((id: string) => (id === VORLAGE.id ? VORLAGE : null));
  });

  it('fills the Vorlage with the topic, without its chip label', async () => {
    const { done } = runWith(
      [{ role: 'user', content: '@Zitat mit Foto Busse auf dem Land' }],
      'alt-zitat'
    );
    await done;
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ vorlage: VORLAGE, brief: 'Busse auf dem Land' })
    );
  });

  it('drafts a fresh card instead of revising the last one', async () => {
    const { done } = runWith(
      [{ role: 'user', content: '@Zitat mit Foto jetzt als Zitat' }],
      'alt-zitat',
      { instruction: 'jetzt als Zitat', prior: CREATOR_PRIOR }
    );
    await done;
    expect(mocks.revise).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ vorlage: VORLAGE }));
  });

  it('drafts freely for an id outside the country catalogue', async () => {
    mocks.vorlage.mockReturnValue({ ...VORLAGE, locale: 'de-AT' });
    const { done } = runWith([{ role: 'user', content: 'Busse auf dem Land' }], 'alt-zitat');
    await done;
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ vorlage: null }));
  });
});

describe('legacySharepicText', () => {
  it('joins the text fields of a three-line sharepic', () => {
    expect(legacySharepicText({ line1: 'Mehr', line2: 'Radwege', line3: 'jetzt' })).toBe(
      'Mehr Radwege jetzt'
    );
  });

  it('reads quote and author, and the info fields', () => {
    expect(legacySharepicText({ quote: 'Wir schaffen das', name: 'Anna' })).toBe(
      'Wir schaffen das Anna'
    );
    expect(
      legacySharepicText({ header: 'Strom', accent: 'sauber', body: 'Alles erneuerbar' })
    ).toBe('Strom sauber Alles erneuerbar');
  });

  it('reads subline and the other template text fields', () => {
    expect(legacySharepicText({ line1: 'Mehr', subline: 'Ausbau bis 2030' })).toBe(
      'Mehr Ausbau bis 2030'
    );
    expect(legacySharepicText({ label: 'Neu', headline: 'Slider', subtext: 'Mehr' })).toBe(
      'Neu Slider Mehr'
    );
  });

  it('skips empty and non-string values', () => {
    expect(legacySharepicText({ line1: ' ', line2: 'Radwege', line3: 3, foo: 'x' })).toBe(
      'Radwege'
    );
    expect(legacySharepicText({})).toBe('');
    expect(legacySharepicText(undefined)).toBe('');
  });

  describe('own photos', () => {
    const PHOTO = {
      id: 'upload:1',
      url: '/api/share/abcdefghijklmnop1234/download',
      analysis: {} as never,
    };
    const NOTE = { art: 'gestaltung', text: 'Ein Foto war zu groß.' } as const;

    it('hands the turn’s photos and their report to a fresh draft', async () => {
      mocks.photosForTurn.mockResolvedValue({ photos: [PHOTO], bericht: [NOTE] });
      await run('Sharepic zu Bussen').done;
      expect(mocks.photosForTurn).toHaveBeenCalledWith(expect.anything(), null);
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ photos: [PHOTO], photoBericht: [NOTE] })
      );
    });

    it('carries the revised variant’s photos into the revision', async () => {
      mocks.photosForTurn.mockResolvedValue({ photos: [PHOTO], bericht: [] });
      mocks.revise.mockResolvedValue(REVISED);
      await run('kürzer', { instruction: 'kürzer', prior: CREATOR_PRIOR }).done;
      expect(mocks.photosForTurn).toHaveBeenCalledWith(expect.anything(), CREATOR_PRIOR.props);
      expect(mocks.revise).toHaveBeenCalledWith(expect.objectContaining({ photos: [PHOTO] }));
    });

    it('drafts without photos and says so when loading them throws', async () => {
      mocks.photosForTurn.mockRejectedValue(new Error('storage down'));
      await run('Sharepic zu Bussen').done;
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: [],
          photoBericht: [
            { art: 'gestaltung', text: 'Deine Fotos konnten diesmal nicht geladen werden.' },
          ],
        })
      );
    });
  });
});
