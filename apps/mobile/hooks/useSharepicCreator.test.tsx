/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import:
   babel-plugin-jest-hoist lifts the `jest.mock` calls above the other requires,
   and only a `@jest/globals` require that already precedes them survives. */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type SharepicSpec } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { act, renderHook } from '@testing-library/react-native';

import {
  CreatorUnsupportedError,
  renderCreator,
  type CreatorRenderInput,
  type CreatorRenderResult,
} from '../services/sharepicRender';

import { useSharepicCreator } from './useSharepicCreator';

jest.mock('@gruenerator/shared/api', () => ({
  getContractsClient: jest.fn(),
}));
jest.mock('../services/sharepicRender', () => {
  class CreatorUnsupportedError extends Error {}
  return { CreatorUnsupportedError, renderCreator: jest.fn() };
});

const specWith = (headline: string): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'oben',
      align: 'links',
      items: [{ type: 'headline', lines: [headline] }],
      logo: false,
    },
  ],
});

const draftSpec = specWith('Mehr Radwege');
const patchedSpec = specWith('Mehr sichere Radwege');
const patch = [{ op: 'replace', path: '/slides/0/items/0/lines/0', value: 'x' }];

const draft = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const review = jest.fn<(...args: unknown[]) => Promise<unknown>>();
(getContractsClient as jest.Mock).mockReturnValue({ sharepicCreator: { draft, review } });
const render = renderCreator as jest.MockedFunction<typeof renderCreator>;

/** The page's answer: patch and choice applied the way the test needs them. */
function turn(input: CreatorRenderInput, extra: Partial<CreatorRenderResult> = {}) {
  const base = input.patch ? patchedSpec : input.base;
  const spec = Object.keys(input.choice).length ? specWith(JSON.stringify(input.choice)) : base;
  return Promise.resolve({
    base,
    spec,
    tweaks: [],
    images: [`data:image/png;base64,${input.patch ? 'PATCHED' : 'DRAFT'}`],
    sheet: input.sheet ? 'data:image/jpeg;base64,SHEET' : null,
    ...extra,
  });
}

beforeEach(() => {
  draft.mockReset();
  review.mockReset();
  render.mockReset();
  draft.mockResolvedValue({
    status: 200,
    body: { spec: draftSpec, chapters: [], attributions: [null] },
  });
  render.mockImplementation((input) => turn(input));
});

describe('useSharepicCreator', () => {
  it('drafts, lets the review patch it and shows the patched render', async () => {
    review.mockResolvedValue({ status: 200, body: { ok: false, issues: ['eng'], patch } });
    const { result } = renderHook(() => useSharepicCreator());

    await act(() => result.current.send('  Ein Sharepic zu Radwegen  '));

    expect(draft).toHaveBeenCalledWith({ body: { prompt: 'Ein Sharepic zu Radwegen' } });
    expect(render.mock.calls[0]![0]).toMatchObject({ base: draftSpec, patch: null, sheet: true });
    expect(review).toHaveBeenCalledWith({
      body: {
        spec: draftSpec,
        prompt: 'Ein Sharepic zu Radwegen',
        image: 'data:image/jpeg;base64,SHEET',
      },
    });
    // The second render applies the patch and asks for one more sheet.
    expect(render.mock.calls[1]![0]).toMatchObject({ base: draftSpec, patch, sheet: true });
    expect(result.current.phase).toBe('ready');
    expect(result.current.design).toEqual({ images: ['data:image/png;base64,PATCHED'] });
    expect(result.current.spec).toEqual(patchedSpec);
    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: 'Hier ist dein Entwurf. Kein Foto, nur Farbflächen. Text und Layout hat die KI entworfen; die Slides tragen das Label „KI-Generiert“ (im Editor entfernbar). Schreib mir, was anders sein soll – oder öffne es im Editor.',
      error: false,
    });
  });

  it('says where the pictures of a revision come from', async () => {
    const photoSpec: SharepicSpec = {
      ...draftSpec,
      slides: [
        {
          ...draftSpec.slides[0]!,
          background: { kind: 'foto', filename: 'a.jpg', textSeite: 'unten' },
        },
      ],
    };
    const credit = {
      photographer: 'Ada Muster',
      profileUrl: 'https://unsplash.com/@x',
      photoUrl: 'https://unsplash.com/photos/x',
    };
    review.mockResolvedValue({ status: 200, body: { ok: true, issues: [], patch: [] } });
    const { result } = renderHook(() => useSharepicCreator());
    await act(() => result.current.send('Ein Sharepic zu Radwegen'));
    draft.mockResolvedValue({
      status: 200,
      body: { spec: photoSpec, chapters: [], attributions: [credit] },
    });

    await act(() => result.current.send('Mit Foto'));

    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: expect.stringMatching(
        /^Erledigt\. Bilder: Stockfoto von Ada Muster auf Unsplash – kein KI-Bild\. Text und Layout hat die KI entworfen/
      ),
      error: false,
    });
  });

  it('skips the review when the page could not build a sheet', async () => {
    render.mockImplementation((input) => turn(input, { sheet: null }));
    const { result } = renderHook(() => useSharepicCreator());

    await act(() => result.current.send('Ein Sharepic zu Radwegen'));

    expect(review).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('ready');
  });

  it('renders a design choice without the model, and revises the tweaked spec', async () => {
    review.mockResolvedValue({ status: 200, body: { ok: true, issues: [], patch: [] } });
    const { result } = renderHook(() => useSharepicCreator());
    await act(() => result.current.send('Ein Sharepic zu Radwegen'));
    draft.mockClear();
    review.mockClear();
    render.mockClear();

    await act(() => result.current.tweak('farbe', 'mint'));

    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![0]).toMatchObject({
      base: draftSpec,
      patch: null,
      choice: { farbe: 'mint' },
      sheet: false,
    });
    expect(draft).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(result.current.tweaked).toBe(true);
    const tweakedSpec = specWith(JSON.stringify({ farbe: 'mint' }));
    expect(result.current.spec).toEqual(tweakedSpec);

    await act(() => result.current.send('Größere Schrift'));
    expect(draft).toHaveBeenCalledWith({
      body: { prompt: 'Größere Schrift', current: tweakedSpec },
    });
    expect(review.mock.calls[0]![0]).toMatchObject({
      body: { prompt: 'Ein Sharepic zu Radwegen\nÄnderung: Größere Schrift' },
    });
    expect(result.current.tweaked).toBe(false);
  });

  it('asks for an update when the deployed page predates the creator', async () => {
    render.mockRejectedValue(new CreatorUnsupportedError());
    const { result } = renderHook(() => useSharepicCreator());

    await act(() => result.current.send('Ein Sharepic zu Radwegen'));

    expect(result.current.phase).toBe('idle');
    expect(result.current.design).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({
      text: 'Diese Funktion braucht eine neuere Version des Grünerators. Versuch es später noch einmal.',
      error: true,
    });
  });

  it('refuses an over-long request without calling the server', async () => {
    const { result } = renderHook(() => useSharepicCreator());

    await act(() => result.current.send('x'.repeat(20_001)));

    expect(draft).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'assistant', error: true });
    expect(result.current.messages.at(-1)!.text).toContain('20.000 Zeichen');
  });
});
