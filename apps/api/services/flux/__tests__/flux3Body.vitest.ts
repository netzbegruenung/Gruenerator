import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FluxImageService, {
  buildFlux3Body,
  isFlux3Path,
  toFlux3AspectRatio,
} from '../FluxImageService.js';

vi.mock('axios');
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));

// `/v1/flux-3-image` answers any other field with 422 (`extra_forbidden`).
const FLUX3_FIELDS = new Set([
  'prompt',
  'images',
  'aspect_ratio',
  'resolution',
  'safety_tolerance',
  'grounding',
  'version',
]);

const png = { buffer: Buffer.from('img'), mimeType: 'image/png' };

describe('buildFlux3Body', () => {
  it('sends only fields the endpoint accepts', () => {
    const body = buildFlux3Body('p', { images: [png], width: 768, height: 960 });
    for (const key of Object.keys(body)) expect(FLUX3_FIELDS).toContain(key);
  });

  it('keeps grounding off so prompts do not reach BFL web search', () => {
    expect(buildFlux3Body('p').grounding).toBe(false);
  });

  it('snaps pixel sizes to the nearest supported ratio', () => {
    expect(buildFlux3Body('p', { width: 768, height: 960 }).aspect_ratio).toBe('4:5');
    expect(toFlux3AspectRatio(1080, 1920)).toBe('9:16');
    expect(toFlux3AspectRatio(1200, 630)).toBe('2:1');
  });

  it('lets an explicit supported ratio win and falls back to auto', () => {
    expect(buildFlux3Body('p', { aspect_ratio: '3:2', width: 10, height: 10 }).aspect_ratio).toBe(
      '3:2'
    );
    expect(buildFlux3Body('p', { images: [png] }).aspect_ratio).toBe('auto');
  });

  it('passes up to ten references as data URLs in order', () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      buffer: Buffer.from(String(i)),
      mimeType: 'image/jpeg',
    }));
    const body = buildFlux3Body('p', { images });
    expect(body.images).toHaveLength(10);
    expect(body.images?.[3]).toBe(`data:image/jpeg;base64,${Buffer.from('3').toString('base64')}`);
  });

  it('defaults to the 1k tier', () => {
    expect(buildFlux3Body('p').resolution).toBe('1k');
    expect(buildFlux3Body('p', { resolution: '2k' }).resolution).toBe('2k');
  });
});

describe('FluxImageService request bodies', () => {
  afterEach(() => vi.mocked(axios.post).mockReset());

  const submittedBody = async (service: FluxImageService) => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: '1', polling_url: 'u' } });
    await service.submit('p', { width: 768, height: 960, output_format: 'jpeg' });
    return vi.mocked(axios.post).mock.calls[0]?.[1] as Record<string, unknown>;
  };

  it('routes the FLUX 3 path through the FLUX 3 body with the catalog resolution', async () => {
    const body = await submittedBody(
      new FluxImageService({ apiKey: 'k', modelPath: '/v1/flux-3-image', resolution: '2k' })
    );
    expect(body).toEqual({
      prompt: 'p',
      aspect_ratio: '4:5',
      resolution: '2k',
      safety_tolerance: 2,
      grounding: false,
    });
  });

  it('leaves the FLUX.2 body unchanged', async () => {
    const body = await submittedBody(
      new FluxImageService({ apiKey: 'k', modelPath: '/v1/flux-2-klein-9b' })
    );
    expect(body).toEqual({
      prompt: 'p',
      width: 768,
      height: 960,
      output_format: 'jpeg',
      safety_tolerance: 2,
      prompt_upsampling: false,
    });
  });

  it('recognizes the FLUX 3 route', () => {
    expect(isFlux3Path('/v1/flux-3-image')).toBe(true);
    expect(isFlux3Path('/v1/flux-2-pro')).toBe(false);
  });
});

describe('FluxImageService.poll', () => {
  afterEach(() => vi.mocked(axios.get).mockReset());

  const service = () => new FluxImageService({ apiKey: 'k', maxRetries: 0 });
  const answer = (...statuses: string[]) => {
    for (const status of statuses) {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { status, result: status === 'Ready' ? { sample: 's' } : undefined },
      });
    }
  };

  it('keeps polling through Reasoning and Generating', async () => {
    answer('Pending', 'Reasoning', 'Generating', 'Ready');
    const result = await service().poll('u', '1', { intervalMs: 1 });
    expect(result.status).toBe('Ready');
  });

  it('stops at moderation with a typed, non-retryable error', async () => {
    answer('Reasoning', 'Content Moderated');
    await expect(service().poll('u', '1', { intervalMs: 1 })).rejects.toMatchObject({
      type: 'moderated',
      retryable: false,
    });
  });

  it('treats an unknown terminal status as a failure instead of polling to the timeout', async () => {
    answer('Task not found');
    await expect(service().poll('u', '1', { intervalMs: 1 })).rejects.toThrow('Task not found');
  });
});
