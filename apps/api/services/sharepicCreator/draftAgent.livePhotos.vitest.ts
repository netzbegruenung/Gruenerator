import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

const unsplash = vi.hoisted(() => ({
  searchPhotos: vi.fn(),
  getPhoto: vi.fn(),
  trackDownload: vi.fn(),
}));
vi.mock('../unsplash/UnsplashApiService.js', () => ({ getUnsplashService: () => unsplash }));

import { draftSharepic } from './draftAgent.js';

const LIVE = 'jane-doe-Abc_def-123-unsplash.jpg';
const DOWNLOAD = 'https://api.unsplash.com/photos/Abc_def-123/download?ixid=x';
const liveImage = {
  filename: LIVE,
  url: 'https://images.unsplash.com/photo-1?w=1080',
  width: 3000,
  height: 4000,
  thumb_url: 'https://images.unsplash.com/photo-1?w=400',
  alt_text: 'wind turbines on a green hill',
  attribution: {
    photographer: 'Jane Q. Doe',
    photographerSlug: 'jane-doe',
    photoId: 'Abc_def-123',
    profileUrl: 'https://unsplash.com/@jane-doe?utm_source=gruenerator&utm_medium=referral',
    photoUrl: 'https://unsplash.com/photos/Abc_def-123?utm_source=gruenerator&utm_medium=referral',
    license: 'Unsplash License',
    downloadLocation: DOWNLOAD,
  },
};

const slide = (filename: string) => ({
  background: { kind: 'foto', filename, textSeite: 'unten' },
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: ['Mehr Wind', 'für alle'] }],
  logo: false,
});

/** The needs step asks for `fotos_suchen`; the draft step answers with `raws` in turn. */
function answers(fotos_suchen: string[], ...raws: unknown[]) {
  aiObject.mockReset();
  aiObject.mockResolvedValueOnce({
    ok: true,
    data: { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen },
  });
  const errors: string[] = [];
  const prompts: string[] = [];
  aiObject.mockImplementationOnce(
    async (opts: {
      system: string;
      validate: (i: unknown) => { ok: boolean; value?: unknown; error?: string };
    }) => {
      prompts.push(opts.system);
      for (const raw of raws) {
        const checked = opts.validate(raw);
        if (checked.ok) return { ok: true, data: checked.value };
        errors.push(checked.error!);
      }
      return { ok: false, error: errors.join(' | ') };
    }
  );
  aiObject.mockResolvedValue({ ok: true, data: { patch: [] } });
  return { errors, prompts };
}

beforeEach(() => {
  unsplash.searchPhotos.mockReset().mockResolvedValue({ results: [liveImage] });
  unsplash.getPhoto.mockReset().mockResolvedValue(liveImage);
  unsplash.trackDownload.mockReset().mockResolvedValue(undefined);
});

describe('draftSharepic — live Unsplash photos', () => {
  it('offers a live hit, places it, credits the real name and reports the use', async () => {
    const { errors, prompts } = answers(['wind turbines'], { slides: [slide(LIVE)] });

    const draft = await draftSharepic('Windkraft ausbauen', 'de-DE', null, [], {});

    expect(errors).toEqual([]);
    expect(unsplash.searchPhotos).toHaveBeenCalledWith('wind turbines', 1, 4, 'portrait');
    expect(prompts[0]).toContain(`- ${LIVE}: wind turbines on a green hill`);
    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: LIVE });
    expect(draft.attributions?.[0]).toMatchObject({ photographer: 'Jane Q. Doe' });
    expect(unsplash.trackDownload).toHaveBeenCalledWith(DOWNLOAD);
  });

  it('keeps a live photo of the current draft in a revision without searching again', async () => {
    const current = {
      locale: 'de-DE',
      format: 'portrait',
      slides: [slide(LIVE)],
    } as unknown as SharepicSpec;
    const { errors } = answers([], { slides: [slide(LIVE)] });

    const draft = await draftSharepic('Headline kürzer', 'de-DE', current, [], {});

    expect(errors).toEqual([]);
    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: LIVE });
    expect(unsplash.trackDownload).not.toHaveBeenCalled();
  });

  it('still rejects a stock name neither searched nor on the draft', async () => {
    const { errors } = answers(['wind turbines'], {
      slides: [slide('john-roe-Zzzzzzzzzzz-unsplash.jpg')],
    });

    await expect(draftSharepic('Windkraft ausbauen', 'de-DE', null, [], {})).rejects.toThrow();
    expect(errors[0]).toContain('gibt es nicht');
  });

  it('falls back to our own photos when the live search fails', async () => {
    unsplash.searchPhotos.mockRejectedValue(new Error('no key'));
    const own = 'diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg';
    const { errors, prompts } = answers(['wind energy'], { slides: [slide(own)] });

    const draft = await draftSharepic('Windkraft ausbauen', 'de-DE', null, [], {});

    expect(errors).toEqual([]);
    expect(prompts[0]).toContain(own);
    expect(prompts[0]).not.toContain(LIVE);
    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: own });
    expect(unsplash.trackDownload).not.toHaveBeenCalled();
  });
});
