/**
 * A refused upload has to reach the user as the sentence the server wrote.
 * Axios rejects a 409 with "Request failed with status code 409" and buries the
 * German text in `response.data`, so without the unwrap below the Mediathek
 * would show a status code where it should say "delete something first".
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const post = vi.fn();

vi.mock('../../api/client.js', () => ({
  getGlobalApiClient: () => ({ post }),
}));

const { uploadMedia } = await import('./mediaApi.js');

const file = new Blob(['x'], { type: 'image/png' });

beforeEach(() => {
  post.mockReset();
});

describe('uploadMedia', () => {
  it('passes a successful upload through unchanged', async () => {
    post.mockResolvedValue({ data: { success: true, data: { id: 'a', shareToken: 't' } } });
    const result = await uploadMedia(file);
    expect(result.success).toBe(true);
    expect(result.data?.shareToken).toBe('t');
  });

  it('unwraps a refusal into the message and code the server sent', async () => {
    post.mockRejectedValue({
      response: {
        status: 400,
        data: { success: false, error: 'Ungültiger Dateityp.', code: 'invalid_type' },
      },
    });

    const result = await uploadMedia(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Ungültiger Dateityp.');
    expect(result.code).toBe('invalid_type');
  });

  it('unwraps a plain error body too', async () => {
    post.mockRejectedValue({ response: { status: 400, data: { error: 'No file provided' } } });
    const result = await uploadMedia(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe('No file provided');
  });

  it('rethrows when there is no response body to read — a network drop is not a refusal', async () => {
    const networkError = new Error('Network Error');
    post.mockRejectedValue(networkError);
    await expect(uploadMedia(file)).rejects.toBe(networkError);
  });
});
