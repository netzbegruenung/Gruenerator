import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cutoutFromRef } from './backgroundRemoval';

const { post, write } = vi.hoisted(() => ({ post: vi.fn(), write: vi.fn() }));

vi.mock('@gruenerator/shared/api', () => ({ getGlobalApiClient: () => ({ post }) }));
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    write = write;
  },
  Paths: { cache: 'cache' },
}));

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('cutoutFromRef', () => {
  it('uploads the ref as file part with type from its extension', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');
    post.mockResolvedValue({ data: { image: PNG_DATA_URL } });
    await cutoutFromRef({ uri: 'file:///cache/edit.png' });
    expect(append).toHaveBeenCalledWith('image', {
      uri: 'file:///cache/edit.png',
      name: 'image.png',
      type: 'image/png',
    });
    expect(post).toHaveBeenCalledWith(
      '/background-removal',
      expect.any(FormData),
      expect.anything()
    );
  });

  it('uploads non-png refs as jpeg', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');
    post.mockResolvedValue({ data: { image: PNG_DATA_URL } });
    await cutoutFromRef({ uri: 'file:///cache/a.jpg' });
    expect(append).toHaveBeenCalledWith('image', {
      uri: 'file:///cache/a.jpg',
      name: 'image.jpg',
      type: 'image/jpeg',
    });
  });

  it('uploads webp refs as image/webp', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');
    post.mockResolvedValue({ data: { image: PNG_DATA_URL } });
    await cutoutFromRef({ uri: 'file:///cache/a.webp?x=1' });
    expect(append).toHaveBeenCalledWith('image', {
      uri: 'file:///cache/a.webp?x=1',
      name: 'image.webp',
      type: 'image/webp',
    });
  });

  it.each([
    [{ response: { status: 429 } }, 'rate_limited'],
    [{ response: { status: 401 } }, 'unauthorized'],
    [{ response: { status: 500 } }, 'unavailable'],
    [{ request: {} }, 'unavailable'],
  ])('maps %o to %s', async (err, kind) => {
    post.mockRejectedValue(err);
    await expect(cutoutFromRef({ uri: 'file:///a.jpg' })).rejects.toMatchObject({ kind });
  });

  it('treats a response without image as unavailable', async () => {
    post.mockResolvedValue({ data: {} });
    await expect(cutoutFromRef({ uri: 'file:///a.jpg' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('writes the result as .png', async () => {
    post.mockResolvedValue({ data: { image: PNG_DATA_URL } });
    expect(await cutoutFromRef({ uri: 'file:///a.jpg' })).toMatch(/\.png$/);
    expect(write).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});
