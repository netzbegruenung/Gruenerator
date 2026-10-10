import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryOne = vi.fn();
const query = vi.fn();
const safeFetch = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ queryOne, query }),
}));
vi.mock('../../utils/validation/urlSecurity.js', () => ({
  safeFetch: (...args: unknown[]) => safeFetch(...args),
}));

const { ensureThumbnailSize, measureThumbnail } = await import('./thumbnailSize.js');

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#000' } })
    .png()
    .toBuffer();

describe('measureThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liest hochgeladene Bilder aus shared_media statt sie abzurufen', async () => {
    queryOne.mockResolvedValue({ width: 1080, height: 1350 });
    expect(await measureThumbnail('/share/abc123')).toEqual({
      url: '/share/abc123',
      width: 1080,
      height: 1350,
    });
    expect(queryOne.mock.calls[0][1]).toEqual(['abc123']);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('misst externe Bilder über safeFetch', async () => {
    safeFetch.mockResolvedValue(new Response(new Uint8Array(await png(40, 50))));
    expect(await measureThumbnail('https://media.canva.com/x.png')).toEqual({
      url: 'https://media.canva.com/x.png',
      width: 40,
      height: 50,
    });
  });

  it('ruft keine relativen oder fremden Schemata ab', async () => {
    expect(await measureThumbnail('/api/irgendwas.png')).toBeNull();
    expect(await measureThumbnail('file:///etc/passwd')).toBeNull();
    expect(safeFetch).not.toHaveBeenCalled();
  });
});

describe('ensureThumbnailSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('misst nicht erneut, wenn für diese URL schon Maße gespeichert sind', async () => {
    const stored = { url: '/share/abc', width: 1, height: 1 };
    expect(await ensureThumbnailSize('t1', '/share/abc', { thumbnail_size: stored })).toBe(stored);
    expect(queryOne).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('misst neu und speichert, wenn sich das Thumbnail geändert hat', async () => {
    queryOne.mockResolvedValue({ width: 1080, height: 1920 });
    const size = await ensureThumbnailSize('t1', '/share/neu', {
      thumbnail_size: { url: '/share/alt', width: 1, height: 1 },
    });
    expect(size).toEqual({ url: '/share/neu', width: 1080, height: 1920 });
    expect(query.mock.calls[0][1]).toEqual(['t1', JSON.stringify(size)]);
  });
});
