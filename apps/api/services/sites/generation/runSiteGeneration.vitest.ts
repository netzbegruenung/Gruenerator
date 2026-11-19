import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type SiteGenerationEvent } from '@gruenerator/contracts';

import { AiProviderError } from '../../providers/providerErrors.js';

const mocks = vi.hoisted(() => ({
  writeSiteContent: vi.fn(),
  extractFlyerText: vi.fn(),
  analyzeFlyer: vi.fn(),
  selectBestImage: vi.fn(),
}));

vi.mock('./writeSiteContent.js', () => ({ writeSiteContent: mocks.writeSiteContent }));
vi.mock('./flyer/extractFlyerText.js', () => ({ extractFlyerText: mocks.extractFlyerText }));
vi.mock('./flyer/analyzeFlyer.js', () => ({ analyzeFlyer: mocks.analyzeFlyer }));
vi.mock('../../image/ImageSelectionService.js', () => ({
  default: { selectBestImage: mocks.selectBestImage },
}));

const {
  runSiteGeneration,
  FLYER_NO_TEXT_MESSAGE,
  FLYER_READ_FAILED_MESSAGE,
  GENERATION_FAILED_MESSAGE,
} = await import('./runSiteGeneration.js');
const { toUserFacingMessage } = await import('../../../utils/errors/index.js');

const content = {
  hero: { title: 'T', text: 'x' },
  hero_image: { title: 'H', subtitle: 'S', imageUrl: '' },
  themes: [{ title: 'A', content: 'B', imageUrl: '' }],
  actions: [{ text: 'Mach mit', link: '#kontakt', imageUrl: '' }],
  contact: { title: 'K', email: 'konto@y.de', backgroundImageUrl: '' },
};

const analysis = {
  name: 'Anna',
  politicalRole: 'Rätin',
  region: 'Stadt',
  themes: ['Klima'],
  slogans: ['Los'],
  contactEmail: 'flyer@x.de',
  rawDescription: 'Beschreibung',
};

function run(
  source: Parameters<typeof runSiteGeneration>[0]['source'],
  signal: AbortSignal = new AbortController().signal,
  onEmit?: (e: SiteGenerationEvent) => void
) {
  const events: SiteGenerationEvent[] = [];
  const done = runSiteGeneration({ source, email: 'konto@y.de', locale: 'de-DE', signal }, (e) => {
    events.push(e);
    onEmit?.(e);
  });
  return { events, done };
}

const text = { kind: 'text', description: 'x'.repeat(60) } as const;
const flyer = { kind: 'flyer', pdf: Buffer.from('%PDF-1.4') } as const;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.writeSiteContent.mockResolvedValue({ ok: true, data: content });
  mocks.extractFlyerText.mockResolvedValue('Flyer Text');
  mocks.analyzeFlyer.mockResolvedValue(analysis);
  mocks.selectBestImage.mockResolvedValue({ selectedImage: { filename: 'a.jpg' } });
});

describe('runSiteGeneration', () => {
  it('runs the text path as write then images', async () => {
    const { events, done } = run(text);
    await done;
    expect(events.map((e) => e.type)).toEqual(['start', 'step', 'step', 'done']);
    expect(events[0]).toEqual({ type: 'start', steps: ['write', 'images'] });
    expect(events[1]).toEqual({ type: 'step', step: 'write' });
    expect(events[2]).toEqual({ type: 'step', step: 'images' });
  });

  it('runs the flyer path through all four steps', async () => {
    const { events, done } = run(flyer);
    await done;
    expect(events[0]).toEqual({
      type: 'start',
      steps: ['extract', 'analyze', 'write', 'images'],
    });
    expect(events.slice(1, 5)).toEqual(
      (['extract', 'analyze', 'write', 'images'] as const).map((step) => ({ type: 'step', step }))
    );
    expect(events[5]?.type).toBe('done');
    const arg = mocks.writeSiteContent.mock.calls[0]?.[0];
    expect(arg.description).toBe('Beschreibung');
    expect(arg.hints).toEqual({ themes: ['Klima'], slogans: ['Los'] });
  });

  it('prefers the flyer e-mail when it is valid', async () => {
    await run(flyer).done;
    expect(mocks.writeSiteContent.mock.calls[0]?.[0].email).toBe('flyer@x.de');
    mocks.writeSiteContent.mockClear();
    mocks.analyzeFlyer.mockResolvedValue({ ...analysis, contactEmail: 'kein-mail' });
    await run(flyer).done;
    expect(mocks.writeSiteContent.mock.calls[0]?.[0].email).toBe('konto@y.de');
  });

  it('reports a flyer without text', async () => {
    mocks.extractFlyerText.mockResolvedValue('');
    const { events, done } = run(flyer);
    await done;
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: FLYER_NO_TEXT_MESSAGE,
      retryable: false,
    });
    expect(mocks.analyzeFlyer).not.toHaveBeenCalled();
  });

  it('reports a failed extraction without its cause', async () => {
    mocks.extractFlyerText.mockRejectedValue(new Error('ENOENT /tmp/secret'));
    const { events, done } = run(flyer);
    await done;
    expect(events.at(-1)).toMatchObject({ type: 'error', message: FLYER_READ_FAILED_MESSAGE });
    expect(JSON.stringify(events)).not.toContain('ENOENT');
  });

  it('reports an invalid generation with the fixed message', async () => {
    mocks.writeSiteContent.mockResolvedValue({ ok: false, error: 'Ungültige Seiteninhalte: x' });
    const { events, done } = run(text);
    await done;
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: GENERATION_FAILED_MESSAGE,
      retryable: true,
    });
    expect(JSON.stringify(events)).not.toContain('Ungültige');
  });

  it('reports a provider outage as retryable', async () => {
    const cause = new AiProviderError('secret provider text', {
      code: 'provider_unavailable',
      retryable: true,
    });
    mocks.writeSiteContent.mockResolvedValue({ ok: false, error: 'x', cause });
    const { events, done } = run(text);
    await done;
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: toUserFacingMessage(cause, GENERATION_FAILED_MESSAGE),
      retryable: true,
    });
  });

  it('stops after an abort', async () => {
    const controller = new AbortController();
    const { events, done } = run(text, controller.signal, (e) => {
      if (e.type === 'step' && e.step === 'write') controller.abort();
    });
    await done;
    expect(mocks.selectBestImage).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'step', step: 'write' });
  });

  it('keeps going when the image picker fails', async () => {
    mocks.selectBestImage.mockRejectedValue(new Error('down'));
    const { events, done } = run(text);
    await done;
    const last = events.at(-1);
    expect(last?.type).toBe('done');
    if (last?.type === 'done') expect(last.content.hero_image.imageUrl).toBe('');
  });
});
