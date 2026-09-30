import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { apiRequest, createApiClient, setGlobalApiClient } from './client.js';

/**
 * Issue #3211: axios `settle()` resolves a status-0 response (XHR torn down by
 * a page reload) without consulting `validateStatus`, so raw callers of the
 * shared client received `''` as if it were the body. The adapter below stands
 * in for the XHR adapter after `settle()` has resolved.
 */
function adapterResolving(status: number, data: unknown): AxiosAdapter {
  return (config) => Promise.resolve({ status, statusText: '', data, headers: {}, config });
}

describe('createApiClient and aborted requests', () => {
  it('rejects a status-0 response as an axios network error', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' });

    const error = await client
      .get('/user-agents', { adapter: adapterResolving(0, '') })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).code).toBe(AxiosError.ERR_NETWORK);
  });

  it('makes apiRequest reject instead of returning an empty body', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'bearer' });
    client.defaults.adapter = adapterResolving(0, '');
    setGlobalApiClient(client);

    await expect(apiRequest('get', '/user-agents')).rejects.toMatchObject({
      code: AxiosError.ERR_NETWORK,
    });
  });

  it('still resolves a real response unchanged', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' });

    const res = await client.get('/user-agents', { adapter: adapterResolving(200, { ok: 1 }) });

    expect(res.data).toEqual({ ok: 1 });
  });
});

describe('createApiClient and FormData bodies', () => {
  it('sends FormData as multipart instead of serializing it to JSON', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' });
    const form = new FormData();
    form.append('document', new Blob(['x']), 'antrag.docx');
    form.append('targetLang', 'en-GB');

    let sent: { data: unknown; contentType: unknown } | null = null;
    await client.post('/translation/document', form, {
      adapter: (config) => {
        sent = { data: config.data, contentType: config.headers.getContentType() };
        return Promise.resolve({ status: 200, statusText: '', data: {}, headers: {}, config });
      },
    });

    // The instance default is `application/json`, which makes axios turn a
    // FormData into `{"document":{},…}` — the file is gone before it leaves.
    expect(sent!.data).toBe(form);
    expect(sent!.contentType).not.toMatch(/json/);
  });
});

describe('createApiClient and an explicit multipart header', () => {
  it('leaves a caller-set multipart Content-Type alone', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' });
    const form = new FormData();
    form.append('file', new Blob(['x']), 'bild.png');

    let contentType: unknown = null;
    await client.post('/background-removal', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      adapter: (config) => {
        contentType = config.headers.getContentType();
        return Promise.resolve({ status: 200, statusText: '', data: {}, headers: {}, config });
      },
    });

    expect(contentType).toBe('multipart/form-data');
  });
});
