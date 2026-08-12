import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveImages, sniffImage } from './imageResolver.js';

vi.mock('../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: vi.fn(async (url: string) =>
    url.startsWith('https:')
      ? { isValid: true, url: new URL(url) }
      : { isValid: false, error: 'Protocol not allowed' }
  ),
}));

import type { FormattedBlock } from './types.js';

/** 1×1 transparent PNG. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function imageBlock(src: string): FormattedBlock {
  return { kind: 'image', src, alt: 'Bild' };
}

/** GIF header claiming the given logical screen size; body irrelevant for sniffing. */
function gifHeader(width: number, height: number): Buffer {
  const data = Buffer.alloc(16);
  data.write('GIF89a', 0, 'latin1');
  data.writeUInt16LE(width, 6);
  data.writeUInt16LE(height, 8);
  return data;
}

describe('sniffImage', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(sniffImage(Buffer.from(PNG_1X1, 'base64'))).toEqual({
      type: 'png',
      width: 1,
      height: 1,
    });
  });

  it('reads JPEG dimensions from the first SOF marker', () => {
    const data = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03,
    ]);
    expect(sniffImage(data)).toEqual({ type: 'jpg', width: 600, height: 300 });
  });

  it('reads GIF dimensions from the logical screen descriptor', () => {
    expect(sniffImage(gifHeader(320, 240))).toEqual({ type: 'gif', width: 320, height: 240 });
  });

  it('reads BMP dimensions from the info header', () => {
    const data = Buffer.alloc(30);
    data.write('BM', 0, 'latin1');
    data.writeInt32LE(640, 18);
    data.writeInt32LE(-480, 22); // top-down BMPs store a negative height
    expect(sniffImage(data)).toEqual({ type: 'bmp', width: 640, height: 480 });
  });

  it('returns null for non-image bytes', () => {
    expect(sniffImage(Buffer.from('kein Bild, nur Text mit genug Bytes dahinter'))).toBeNull();
  });
});

describe('resolveImages', () => {
  it('resolves a base64 data URI without touching the network', async () => {
    const src = `data:image/png;base64,${PNG_1X1}`;
    const resolved = await resolveImages([imageBlock(src)]);

    const image = resolved.get(src);
    expect(image?.type).toBe('png');
    expect(image?.width).toBe(1);
    expect(image?.height).toBe(1);
  });

  it('scales oversized images down to the page box, keeping the ratio', async () => {
    const src = `data:image/gif;base64,${gifHeader(3000, 1000).toString('base64')}`;
    const resolved = await resolveImages([imageBlock(src)]);

    expect(resolved.get(src)).toMatchObject({ type: 'gif', width: 600, height: 200 });
  });

  it('leaves undecodable data URIs unresolved', async () => {
    const src = `data:image/png;base64,${Buffer.from('kein Bild').toString('base64')}`;
    const resolved = await resolveImages([imageBlock(src)]);
    expect(resolved.size).toBe(0);
  });

  it('rejects non-https URLs before any request is made', async () => {
    const resolved = await resolveImages([
      imageBlock('http://example.org/a.png'),
      imageBlock('file:///etc/passwd'),
      imageBlock('javascript:alert(1)'),
    ]);
    expect(resolved.size).toBe(0);
  });
});

describe('resolveImages — fetch path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  it('embeds a fetched image', async () => {
    const png = Buffer.from(PNG_1X1, 'base64');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(streamOf([new Uint8Array(png)]), { status: 200 }))
    );

    const resolved = await resolveImages([imageBlock('https://example.org/a.png')]);
    expect(resolved.get('https://example.org/a.png')).toMatchObject({
      type: 'png',
      width: 1,
      height: 1,
    });
  });

  // `content-length` is just a hint; the cap has to hold against a body that
  // is silently larger than declared.
  it('drops a body that exceeds the cap regardless of content-length', async () => {
    const megabyte = new Uint8Array(1024 * 1024);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(streamOf(Array.from({ length: 9 }, () => megabyte)), {
            status: 200,
            headers: { 'content-length': '10' },
          })
      )
    );

    const resolved = await resolveImages([imageBlock('https://example.org/huge.png')]);
    expect(resolved.size).toBe(0);
  });
});
