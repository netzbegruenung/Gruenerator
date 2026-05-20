import { config } from './config.ts';

interface ApiCallOptions {
  apiKey: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export async function callGrueneratorApi<T = Record<string, unknown>>(
  path: string,
  opts: ApiCallOptions
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const baseUrl = config.api.url;
  if (!baseUrl) {
    return {
      ok: false,
      status: 0,
      message:
        'GRUENERATOR_API_URL not configured on the MCP server. Set it to e.g. https://api.gruenerator.eu.',
    };
  }

  const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
  const url = `${baseUrl}${path}${qs}`;
  const method = opts.method ?? 'GET';

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      ...(opts.body && { body: JSON.stringify(opts.body) }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        status: response.status,
        message: text.slice(0, 500) || response.statusText,
      };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, message: `Network error: ${message}` };
  }
}
