import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { type CreatorPhoto, PHOTO_ONLY_PROMPT } from './sharepicPhotos';
import { useSharepicCreator } from './useSharepicCreator';

const composer = vi.hoisted(() => ({
  composeSharepic: vi.fn(),
}));
vi.mock('@gruenerator/canvas-editor/composer', () => ({
  composeSharepic: composer.composeSharepic,
  applySharepicPatch: (spec: unknown) => ({ spec }),
  ensureFontsReady: () => Promise.resolve(),
}));
vi.mock('../renderSharepicToImage', () => ({
  renderSharepicToImage: () => Promise.resolve('data:image/png;base64,AA'),
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

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  bodies = [];
  composer.composeSharepic.mockReset();
  composer.composeSharepic.mockReturnValue({ templateType: 'freeform', slides: [{}] });
  server.use(
    http.post(DRAFT, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      return HttpResponse.json({
        spec: spec('upload:1'),
        chapters: [],
        attributions: [null],
      });
    }),
    http.post(REVIEW, () => HttpResponse.json({ ok: true, issues: [], patch: [] }))
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
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    expect(bodies[0]).toMatchObject({
      prompt: 'Sharepic zum Infostand',
      photos: [{ id: 'upload:1', analysis }],
    });
    // The URL stays on the client: the server reads the file itself.
    expect(JSON.stringify(bodies[0])).not.toContain('/api/share/');
  });

  it('hands the composer the library url for upload:1 and the stock url for a stock photo', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    const { photoSrc } = composer.composeSharepic.mock.calls[0]![1] as {
      photoSrc: (f: string) => string;
    };
    expect(photoSrc('upload:1')).toBe(photo(1).url);
    expect(photoSrc('wind.jpg')).toBe('/api/image-picker/stock-image/wind.jpg');
  });

  it('draws a photo without text: the prompt says so', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, '', [photo(1)]);
    expect(bodies[0]!.prompt).toBe(PHOTO_ONLY_PROMPT);
    expect(result.current.messages[0]!.text).toContain('foto-1.jpg');
  });

  it('keeps the photos for the revision, numbering new ones on', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    await sendAndWait(result, 'Nimm auch dieses Foto', [photo(2)]);
    expect(bodies[1]!.photos!.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
    expect(bodies[1]!.current).toBeTruthy();
    await sendAndWait(result, 'Kürzer bitte');
    expect(bodies[2]!.photos!.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
  });

  it('takes at most four photos in a session and says so', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Sharepic', [photo(1), photo(2), photo(3), photo(4), photo(5)]);
    expect(bodies[0]!.photos).toHaveLength(4);
    expect(result.current.messages.some((m) => m.error && m.text.includes('Mehr als 4'))).toBe(
      true
    );
  });

  it('sends no photos field when there are none', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Mehr Busse auf dem Land');
    expect(bodies[0]).not.toHaveProperty('photos');
  });

  it('says own photo in the reply and not Unsplash', async () => {
    const { result } = renderHook(() => useSharepicCreator());
    await sendAndWait(result, 'Sharepic zum Infostand', [photo(1)]);
    const reply = result.current.messages.at(-1)!;
    expect(reply.text).toContain('Eigenes Foto – kein KI-Bild');
    expect(reply.text).not.toContain('Unsplash');
  });
});
