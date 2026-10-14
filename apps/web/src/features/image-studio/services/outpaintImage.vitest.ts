import { beforeEach, describe, expect, it, vi } from 'vitest';

import { outpaintImage } from './imageEditingService';

const post = vi.fn();
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGlobalApiClient: () => ({ post }),
}));

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

describe('outpaintImage', () => {
  beforeEach(() => post.mockReset());

  it('posts form data and prefixes raw base64', async () => {
    post.mockResolvedValue({ data: { success: true, image: { base64: 'AAA' } } });
    const url = await outpaintImage(file, '16:9', 'short');
    expect(url).toBe('data:image/png;base64,AAA');
    const [path, form] = post.mock.calls[0];
    expect(path).toBe('/imagine/outpaint');
    expect(form.get('aspectRatio')).toBe('16:9');
    expect(form.get('kiLabel')).toBe('short');
  });

  it('omits kiLabel for full and keeps data URLs', async () => {
    post.mockResolvedValue({
      data: { success: true, image: { base64: 'data:image/png;base64,B' } },
    });
    expect(await outpaintImage(file, '1:1', 'full')).toBe('data:image/png;base64,B');
    expect(post.mock.calls[0][1].has('kiLabel')).toBe(false);
  });

  it('throws the server error or a default', async () => {
    post.mockResolvedValue({ data: { success: false, error: 'nope' } });
    await expect(outpaintImage(file, '1:1', 'full')).rejects.toThrow('nope');
    post.mockResolvedValue({ data: { success: false } });
    await expect(outpaintImage(file, '1:1', 'full')).rejects.toThrow('Vergrößerung fehlgeschlagen');
  });
});
