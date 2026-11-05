import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FluxImageService, { isEndpointUnreachable } from '../FluxImageService.js';

vi.mock('axios');
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));

const EU = 'https://api.eu.bfl.ai/v1/flux-3-image';
const GLOBAL = 'https://api.bfl.ai/v1/flux-3-image';

// What axios threw on 04.11.2026 when the EU front door served `*.azureedge.net`.
const tlsError = Object.assign(new Error("Host: api.eu.bfl.ai. is not in the cert's altnames"), {
  code: 'ERR_TLS_CERT_ALTNAME_INVALID',
});
const serverError = Object.assign(new Error('Request failed with status code 422'), {
  response: { status: 422, data: { detail: 'bad' } },
});

const postedUrls = () => vi.mocked(axios.post).mock.calls.map((call) => call[0]);

describe('FLUX endpoint fallback', () => {
  afterEach(() => vi.mocked(axios.post).mockReset());

  it('sends the request to the global endpoint when the EU endpoint fails TLS', async () => {
    vi.mocked(axios.post).mockImplementation((url: string) =>
      url === EU
        ? Promise.reject(tlsError)
        : Promise.resolve({ data: { id: '1', polling_url: 'u' } })
    );
    const request = await new FluxImageService({ apiKey: 'k' }).submit('p');
    expect(request.id).toBe('1');
    expect(postedUrls()).toEqual([EU, GLOBAL]);
  });

  it('keeps a person’s own photo off the global endpoint', async () => {
    vi.mocked(axios.post).mockRejectedValue(tlsError);
    const flux = new FluxImageService({ apiKey: 'k' });
    await expect(
      flux.generateFromImages('p', [{ buffer: Buffer.from('x'), mimeType: 'image/jpeg' }], {
        euOnly: true,
      })
    ).rejects.toThrow();
    expect(postedUrls()).toEqual([EU]);
  });

  it('stays on the EU endpoint when it answered, even with an error', async () => {
    vi.mocked(axios.post).mockRejectedValue(serverError);
    await expect(new FluxImageService({ apiKey: 'k' }).submit('p')).rejects.toThrow();
    expect(postedUrls()).toEqual([EU]);
  });

  it('never falls back from an endpoint the caller chose', async () => {
    vi.mocked(axios.post).mockRejectedValue(tlsError);
    const flux = new FluxImageService({ apiKey: 'k', baseUrl: 'https://example.test' });
    await expect(flux.submit('p')).rejects.toThrow();
    expect(postedUrls()).toEqual(['https://example.test/v1/flux-3-image']);
  });
});

describe('isEndpointUnreachable', () => {
  it('counts DNS, refused connections and TLS failures, not HTTP answers', () => {
    expect(isEndpointUnreachable(tlsError)).toBe(true);
    expect(isEndpointUnreachable(Object.assign(new Error(), { code: 'ENOTFOUND' }))).toBe(true);
    expect(isEndpointUnreachable(serverError)).toBe(false);
    // A timeout may come after BFL accepted the request: resending could bill twice.
    expect(isEndpointUnreachable(Object.assign(new Error(), { code: 'ECONNABORTED' }))).toBe(false);
  });
});
