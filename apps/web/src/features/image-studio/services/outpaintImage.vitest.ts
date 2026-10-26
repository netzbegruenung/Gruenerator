import { AI_CONSENT_REQUIRED_CODE } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expandCanvasImage,
  nearestOutpaintFormat,
  outpaintErrorMessage,
  outpaintImage,
} from './imageEditingService';

const post = vi.fn<(path: string, form: FormData) => Promise<unknown>>();
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

describe('nearestOutpaintFormat', () => {
  it('maps a frame to the closest preset on a log scale', () => {
    expect(nearestOutpaintFormat(1080 / 1350)).toBe('4:5');
    expect(nearestOutpaintFormat(1)).toBe('1:1');
    expect(nearestOutpaintFormat(1920 / 1080)).toBe('16:9');
    expect(nearestOutpaintFormat(1080 / 1920)).toBe('9:16');
    expect(nearestOutpaintFormat(3 / 2)).toBe('4:3');
    expect(nearestOutpaintFormat(5)).toBe('16:9');
    expect(nearestOutpaintFormat(0.2)).toBe('9:16');
  });
});

describe('outpaintErrorMessage', () => {
  const failure = (status: number, data: unknown) => ({ response: { status, data } });
  it('says what went wrong in German', () => {
    expect(outpaintErrorMessage(failure(400, { error: 'Zu klein.' }))).toBe('Zu klein.');
    expect(outpaintErrorMessage(failure(403, { code: AI_CONSENT_REQUIRED_CODE }))).toMatch(
      /Einwilligung/
    );
    expect(outpaintErrorMessage(failure(429, {}))).toMatch(/Budget/);
    expect(outpaintErrorMessage(new Error('Network Error'))).toMatch(/nicht geklappt/);
  });
});

describe('expandCanvasImage', () => {
  beforeEach(() => post.mockReset());

  it('outpaints to the nearest preset with the full label and returns a file', async () => {
    post.mockResolvedValue({
      data: { success: true, image: { base64: 'data:image/jpeg;base64,AAAA' } },
    });
    const result = await expandCanvasImage(file, 1080 / 1350);
    const form = post.mock.calls[0][1];
    expect(form.get('aspectRatio')).toBe('4:5');
    expect(form.has('kiLabel')).toBe(false);
    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe('image/jpeg');
  });

  it('rejects with the user-facing message', async () => {
    post.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), { response: { status: 429, data: {} } })
    );
    const caught = await expandCanvasImage(file, 1).catch((e: unknown) => e);
    expect(caught).toEqual(new Error('Dein Bild-Budget für heute ist aufgebraucht.'));
  });
});
