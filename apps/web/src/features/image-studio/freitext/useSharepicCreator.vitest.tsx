import { SHAREPIC_PROMPT_MAX } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { saveCreatorSession } from './creatorSession';
import { type CreatorPhoto, PHOTO_ONLY_PROMPT } from './sharepicPhotos';
import { useSharepicCreator } from './useSharepicCreator';

import type * as Composer from '@gruenerator/canvas-editor/composer';

const composer = vi.hoisted(() => ({
  composeSharepic: vi.fn(),
  render: vi.fn(),
}));
vi.mock('@gruenerator/canvas-editor/composer', async () => {
  const tweaks = await vi.importActual<typeof Composer>('@gruenerator/canvas-editor/composer');
  return {
    composeSharepic: composer.composeSharepic,
    applySharepicPatch: (spec: unknown) => ({ spec }),
    applySharepicTweaks: tweaks.applySharepicTweaks,
    sharepicTweaks: tweaks.sharepicTweaks,
    ensureFontsReady: () => Promise.resolve(),
  };
});
vi.mock('../renderSharepicToImage', () => ({
  renderSharepicToImage: composer.render,
}));
vi.mock('./photoTone', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  primePhotoTones: () => Promise.resolve(),
}));

const DRAFT = 'http://localhost/api/sharepic-creator/draft';
const REVIEW = 'http://localhost/api/sharepic-creator/review';

const analysis = {
  motiv: 'Infostand',
  personen: 2,
  ruhigeSeite: 'oben' as const,
  hell: true,
  eignung: 'vollflaeche' as const,
  stichworte: ['Markt'],
  analysiert: true,
};
const photo = (n: number): CreatorPhoto => ({
  name: `foto-${n}.jpg`,
  url: `/api/share/${String(n).repeat(32)}/download`,
  analysis,
});

const spec = (filename: string) => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto', filename, textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [{ type: 'headline', lines: ['Mach mit', 'bei uns!'] }],
      logo: true,
    },
  ],
});

let bodies: { prompt: string; photos?: { id: string }[]; current?: unknown }[];
let reviews: number;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  bodies = [];
  reviews = 0;
  composer.composeSharepic.mockReset();
  composer.composeSharepic.mockReturnValue({ templateType: 'freeform', slides: [{}] });
  composer.render.mockReset();
  composer.render.mockResolvedValue('data:image/png;base64,AA');
  server.use(
    http.post(DRAFT, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      return HttpResponse.json({
        spec: spec('upload:1'),
        chapters: [],
        attributions: [null],
      });
    }),
    http.post(REVIEW, () => {
      reviews++;
      return HttpResponse.json({ ok: true, issues: [], patch: [] });
    })
  );
});
afterEach(() => server.resetHandlers());

async function sendAndWait(
  result: { current: ReturnType<typeof useSharepicCreator> },
  text: string,
  photos?: CreatorPhoto[]
) {
  await act(async () => {
    await result.current.send(text, photos);
  });
  await waitFor(() => expect(result.current.phase).toBe('ready'));
}

describe('useSharepicCreator with own photos', () => {
  it('sends the attached photo to the draft as upload:1 with its analysis', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    expect(bodies[0]).toMatchObject({
      prompt: 'Sharepic zum Infostand',
      photos: [{ id: 'upload:1', analysis }],
    });
    // The URL stays on the client: the server reads the file itself.
    expect(JSON.stringify(bodies[0])).not.toContain('/api/share/');
  });

  it('hands the composer the library url for upload:1 and the stock url for a stock photo', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    const { photoSrc } = composer.composeSharepic.mock.calls[0]![1] as {
      photoSrc: (f: string) => string;
    };
    expect(photoSrc('upload:1')).toBe(photo(1).url);
    expect(photoSrc('wind.jpg')).toBe('/api/image-picker/stock-image/wind.jpg');
  });

  it('draws a photo without text: the prompt says so', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, '', [photo(1)]);
    expect(bodies[0]!.prompt).toBe(PHOTO_ONLY_PROMPT);
    expect(result.current.messages[0]!.text).toContain('foto-1.jpg');
  });

  it('keeps the photos for the revision, numbering new ones on', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    await sendAndWait(result, 'Nimm auch dieses Foto', [photo(2)]);
    expect(bodies[1]!.photos!.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
    expect(bodies[1]!.current).toBeTruthy();
    await sendAndWait(result, 'Kürzer bitte');
    expect(bodies[2]!.photos!.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
  });

  it('takes at most four photos in a session and says so', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic', [photo(1), photo(2), photo(3), photo(4), photo(5)]);
    expect(bodies[0]!.photos).toHaveLength(4);
    expect(result.current.messages.some((m) => m.error && m.text.includes('Mehr als 4'))).toBe(
      true
    );
  });

  it('lets a photo carry a request of fewer than three characters', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'ok', [photo(1)]);
    expect(bodies[0]!.prompt).toBe(`${PHOTO_ONLY_PROMPT} ok`);
  });

  it('does not count photos of a failed draft, and does not number them twice on retry', async () => {
    let calls = 0;
    server.use(
      http.post(DRAFT, async ({ request }) => {
        bodies.push((await request.json()) as (typeof bodies)[number]);
        return ++calls === 1
          ? HttpResponse.json({ error: 'x' }, { status: 502 })
          : HttpResponse.json({ spec: spec('upload:1'), chapters: [], attributions: [null] });
      })
    );
    const { result } = renderHook(() => useSharepicCreator(null));
    await act(async () => {
      await result.current.send('Sharepic zum Infostand', [photo(1)]);
    });
    expect(result.current.photoCount).toBe(0);
    // The same library file again: still upload:1, one slot.
    await sendAndWait(result, 'Nochmal', [photo(1)]);
    expect(bodies[1]!.photos!.map((p) => p.id)).toEqual(['upload:1']);
    expect(result.current.photoCount).toBe(1);
  });

  it('sends no photos field when there are none', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Mehr Busse auf dem Land');
    expect(bodies[0]).not.toHaveProperty('photos');
  });

  it('says so when a revision comes back unchanged instead of claiming it is done', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    await sendAndWait(result, 'Text nach unten');
    const reply = result.current.messages.at(-1)!;
    expect(reply.text).toMatch(/nichts geändert/);
    expect(reply.text).not.toMatch(/^Erledigt/);
  });

  it('says done when a revision changes the draft', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    server.use(
      http.post(DRAFT, () =>
        HttpResponse.json({ spec: spec('wind.jpg'), chapters: [], attributions: [null] })
      )
    );
    await sendAndWait(result, 'Anderes Foto');
    expect(result.current.messages.at(-1)!.text).toMatch(/^Erledigt/);
  });

  it('says own photo in the reply and not Unsplash', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    const reply = result.current.messages.at(-1)!;
    expect(reply.text).toContain('Eigenes Foto – kein KI-Bild');
    expect(reply.text).not.toContain('Unsplash');
  });
});

describe('useSharepicCreator after a carousel revision', () => {
  const slide = (lines: string[], filename: string | null = null) => ({
    background: filename
      ? { kind: 'foto', filename, textSeite: 'unten' }
      : { kind: 'farbe', color: 'tanne' },
    position: 'mitte',
    align: 'links',
    items: [{ type: 'headline', lines }],
    logo: false,
  });
  const carousel = (first: string[], second: string[]) => ({
    locale: 'de-DE',
    slides: [slide(first, 'rad.jpg'), slide(second)],
  });
  const credit = {
    photographer: 'Mike Marrah',
    profileUrl: 'https://unsplash.com/@x',
    photoUrl: 'https://unsplash.com/photos/x',
  };
  const answer = (body: object) =>
    server.use(
      http.post(DRAFT, () =>
        HttpResponse.json({ ...body, chapters: [], attributions: [credit, null] })
      )
    );

  it('does not claim done when the named slide stayed and only another one moved (prod)', async () => {
    answer({ spec: carousel(['Radwege', 'jetzt'], ['Sicherer', 'für alle']) });
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Karussell zu Radwegen');
    answer({ spec: carousel(['Radwege', 'jetzt'], ['Sicher', 'für alle']) });
    await sendAndWait(result, 'bei der 1. slide einen anderen text wählen');
    const reply = result.current.messages.at(-1)!.text;
    expect(reply).not.toMatch(/Erledigt/);
    expect(reply).toMatch(/^Folie 1 hat sich nicht geändert\./);
    expect(reply).not.toContain('Unsplash');
  });

  it('checks a first draft as a draft and a revision as an edit of this turn’s wish', async () => {
    const sent: { prompt: string; mode?: string }[] = [];
    server.use(
      http.post(REVIEW, async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json({ ok: true, issues: [], patch: [] });
      })
    );
    answer({ spec: carousel(['Radwege', 'jetzt'], ['Sicherer', 'für alle']) });
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Karussell zu Radwegen');
    answer({ spec: carousel(['Mehr Platz', 'fürs Rad'], ['Sicherer', 'für alle']) });
    await sendAndWait(result, 'slide 1 anderer text');
    expect(sent.map(({ prompt, mode }) => ({ prompt, mode }))).toEqual([
      { prompt: 'Karussell zu Radwegen', mode: 'draft' },
      { prompt: 'slide 1 anderer text', mode: 'edit' },
    ]);
  });

  it('says what changed on the named slide, without the picture credits', async () => {
    answer({ spec: carousel(['Radwege', 'jetzt'], ['Sicherer', 'für alle']) });
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Karussell zu Radwegen');
    answer({ spec: carousel(['Mehr Platz', 'fürs Rad'], ['Sicherer', 'für alle']) });
    await sendAndWait(result, 'slide 1 anderer text');
    expect(result.current.messages.at(-1)!.text).toBe(
      'Erledigt – Folie 1: Überschrift jetzt „Mehr Platz fürs Rad“.'
    );
  });
});

describe('useSharepicCreator with a long request', () => {
  it('sends a pasted press release of a few thousand characters', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    const release = 'Pressemitteilung zur Eröffnung des Gemeinschaftsgartens. '.repeat(200);
    await sendAndWait(result, release);
    expect(bodies[0]?.prompt.length).toBeGreaterThan(10_000);
  });

  it('says the text is too long instead of failing, and sends nothing', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await act(async () => {
      await result.current.send('x'.repeat(SHAREPIC_PROMPT_MAX + 1));
    });
    expect(bodies).toHaveLength(0);
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'assistant', error: true });
    expect(result.current.messages.at(-1)?.text).toContain('zu lang');
  });
});

describe('useSharepicCreator across a reload', () => {
  beforeEach(() => localStorage.clear());

  async function resumeAs(userId: string) {
    const { result } = renderHook(() => useSharepicCreator(userId));
    let resumed = false;
    act(() => {
      resumed = result.current.resume();
    });
    return { result, resumed };
  }

  it('brings back the messages, the spec and the photos, and re-renders the preview', async () => {
    const first = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(first.result, 'Sharepic zum Infostand', [photo(1)]);
    const messages = first.result.current.messages;
    first.unmount();

    const { result, resumed } = await resumeAs('user-1');
    expect(resumed).toBe(true);
    expect(result.current.messages).toEqual(messages);
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.design?.previews).toEqual(['data:image/png;base64,AA']);
    expect(result.current.photoCount).toBe(1);

    // The revision builds on the restored spec and keeps numbering the photos.
    await sendAndWait(result, 'Kürzer bitte', [photo(2)]);
    expect(bodies[1]!.current).toEqual(spec('upload:1'));
    expect(bodies[1]!.photos!.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
    expect(new Set(result.current.messages.map((m) => m.id)).size).toBe(
      result.current.messages.length
    );
  });

  it('keeps no rendered image in storage', async () => {
    const { result } = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(result, 'Sharepic zum Infostand');
    expect(localStorage.getItem('gruenerator-sharepic-creator-v1')).not.toContain('data:image');
  });

  it('ignores a corrupt snapshot', async () => {
    localStorage.setItem('gruenerator-sharepic-creator-v1', '{"userId":"user-1","messages":');
    expect((await resumeAs('user-1')).resumed).toBe(false);
    localStorage.setItem(
      'gruenerator-sharepic-creator-v1',
      JSON.stringify({ userId: 'user-1', messages: [{ id: 0 }] })
    );
    expect((await resumeAs('user-1')).resumed).toBe(false);
  });

  it("does not show another account's session", async () => {
    saveCreatorSession({
      userId: 'user-1',
      messages: [{ id: 0, role: 'user', text: 'Geheim', error: false }],
      spec: null,
      attributions: [],
      brief: 'Geheim',
      photos: [],
    });
    const { result, resumed } = await resumeAs('user-2');
    expect(resumed).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it('keeps brief, credits and photos with the old spec when the render fails', async () => {
    const { result } = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(result, 'Sharepic zum Infostand');
    const stored = () =>
      JSON.parse(localStorage.getItem('gruenerator-sharepic-creator-v1')!) as {
        messages: { error?: boolean }[];
      };
    const before = stored();
    composer.render.mockResolvedValue(null);
    server.use(
      http.post(DRAFT, () =>
        HttpResponse.json({
          spec: spec('upload:1'),
          chapters: [],
          attributions: [{ photographer: 'X', profileUrl: 'https://unsplash.com/@x' }],
        })
      )
    );
    await sendAndWait(result, 'Nimm dieses Foto', [photo(1)]);
    const after = stored();
    expect(after.messages.at(-1)).toMatchObject({ error: true });
    expect({ ...after, messages: null }).toEqual({ ...before, messages: null });
    expect(result.current.photoCount).toBe(0);
  });

  it('does not save the error of a restore that failed to render', async () => {
    const first = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(first.result, 'Sharepic zum Infostand');
    const saved = localStorage.getItem('gruenerator-sharepic-creator-v1');
    first.unmount();

    composer.render.mockResolvedValue(null);
    const { result } = await resumeAs('user-1');
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.messages.at(-1)).toMatchObject({ error: true });
    expect(localStorage.getItem('gruenerator-sharepic-creator-v1')).toBe(saved);
  });

  const carousel = () => ({
    locale: 'de-DE',
    slides: [0, 1, 2].map((k) => ({
      ...spec('wind.jpg').slides[0],
      ...(k === 1 ? { weiter: 'Denn' } : {}),
    })),
  });
  const composedSpec = () =>
    composer.composeSharepic.mock.calls.at(-1)![0] as { slides: { weiter?: string }[] };
  const navigation = (result: { current: ReturnType<typeof useSharepicCreator> }) =>
    result.current.tweaks.find((t) => t.id === 'navigation')?.value;

  it('keeps the draft as the base of the variations across a reload', async () => {
    server.use(
      http.post(DRAFT, async ({ request }) => {
        bodies.push((await request.json()) as (typeof bodies)[number]);
        return HttpResponse.json({ spec: carousel(), chapters: [], attributions: [null] });
      })
    );
    const first = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(first.result, 'Karussell zum Klimaschutz');
    await act(async () => {
      await first.result.current.tweak('navigation', 'bruch');
    });
    expect(composedSpec().slides[1]!.weiter).toBeUndefined();
    first.unmount();

    const { result } = await resumeAs('user-1');
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.tweaked).toBe(true);
    expect(navigation(result)).toBe('bruch');

    // Switching back brings back what the earlier choice dropped.
    await act(async () => {
      await result.current.tweak('navigation', 'pfeil');
    });
    expect(composedSpec().slides[1]!.weiter).toBe('Denn');

    await act(async () => {
      await result.current.tweak('navigation', 'bruch');
    });
    await act(async () => {
      await result.current.resetTweaks();
    });
    expect(composedSpec()).toEqual(carousel());
    expect(result.current.tweaked).toBe(false);
  });

  it('resumes a session saved before design variations with its spec as the draft', async () => {
    saveCreatorSession({
      userId: 'user-1',
      messages: [{ id: 0, role: 'user', text: 'Karussell', error: false }],
      spec: carousel() as Parameters<typeof saveCreatorSession>[0]['spec'],
      attributions: [null, null, null],
      brief: 'Karussell',
      photos: [],
    });
    const { result, resumed } = await resumeAs('user-1');
    expect(resumed).toBe(true);
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.tweaked).toBe(false);
    expect(navigation(result)).toBe('pfeil');
    expect(composedSpec()).toEqual(carousel());
  });

  it('does not persist a turn that is still in flight', async () => {
    const { result } = renderHook(() => useSharepicCreator('user-1'));
    await sendAndWait(result, 'Sharepic zum Infostand');
    const saved = localStorage.getItem('gruenerator-sharepic-creator-v1');
    server.use(http.post(DRAFT, () => new Promise<never>(() => {})));
    act(() => {
      void result.current.send('Kürzer bitte');
    });
    await waitFor(() => expect(result.current.phase).toBe('drafting'));
    expect(localStorage.getItem('gruenerator-sharepic-creator-v1')).toBe(saved);
  });
});

describe('useSharepicCreator design variations', () => {
  const colourOf = (call: unknown[]) =>
    (call[0] as { slides: { background: { kind: string; panelColor?: string; color?: string } }[] })
      .slides[0]!.background;

  it('switches a variation locally: no draft, no review, and the next turn builds on it', async () => {
    server.use(
      http.post(DRAFT, async ({ request }) => {
        bodies.push((await request.json()) as (typeof bodies)[number]);
        return HttpResponse.json({
          spec: {
            ...spec('wind.jpg'),
            slides: [
              { ...spec('wind.jpg').slides[0], background: { kind: 'farbe', color: 'mint' } },
            ],
          },
          chapters: [],
          attributions: [null],
        });
      })
    );
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand');
    expect(result.current.tweaks.map((t) => t.id)).toEqual(['farbe', 'zeilenboxen']);
    const before = { drafts: bodies.length, reviews };

    await act(async () => {
      await result.current.tweak('farbe', 'dunkeltanne');
    });
    expect(colourOf(composer.composeSharepic.mock.calls.at(-1)!)).toEqual({
      kind: 'farbe',
      color: 'dunkeltanne',
    });
    expect({ drafts: bodies.length, reviews }).toEqual(before);
    expect(result.current.tweaked).toBe(true);

    await sendAndWait(result, 'Kürzer bitte');
    expect(JSON.stringify(bodies.at(-1)!.current)).toContain('dunkeltanne');
    // A new draft is the new starting point: its choices start empty.
    expect(result.current.tweaked).toBe(false);
  });

  it('goes back to the draft as it was', async () => {
    const { result } = renderHook(() => useSharepicCreator(null));
    await sendAndWait(result, 'Sharepic zum Infostand');
    await act(async () => {
      await result.current.tweak('zeilenboxen', 'an');
    });
    await act(async () => {
      await result.current.resetTweaks();
    });
    const last = composer.composeSharepic.mock.calls.at(-1)![0] as {
      slides: { zeilenboxen?: boolean }[];
    };
    expect(last.slides[0]!.zeilenboxen).toBeUndefined();
    expect(result.current.tweaked).toBe(false);
  });
});
