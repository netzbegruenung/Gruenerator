import { describe, expect, it } from 'vitest';

import { HttpStatusError } from '../../base/BaseScraper.js';
import { PoliteGate, type Fetcher } from '../../parliament/index.js';

import { PardokClient, type PardokRecord } from './pardokClient.js';

const record = (id: number, datum: string): PardokRecord => ({
  id: [{ main: `D-${id}` }],
  dokumentnummer: [{ main: String(id) }],
  titel: [{ main: '', t: `Titel ${id}` }],
  datum,
});

/**
 * Ein PARDOK im Kleinen: 5 Einträge, neueste zuerst, 2 je Seite, der Cursor
 * ist der Index. Wie das Original springt die Liste nach dem Ende an den Anfang.
 */
function fakePardok(options: { invalidCursorAt?: string } = {}) {
  const all = [
    record(5, '2026.09.05'),
    record(4, '2026.09.04'),
    record(3, '2026.09.03'),
    record(2, '2026.09.02'),
    record(1, '2026.09.01'),
  ];
  const calls: URLSearchParams[] = [];
  let failed = false;
  const fetcher: Fetcher = (url) => {
    const params = new URL(url).searchParams;
    calls.push(params);
    const cursor = params.get('cursor');
    if (cursor && cursor === options.invalidCursorAt && !failed) {
      failed = true;
      return Promise.reject(new HttpStatusError(400));
    }
    const end = params.get('f.datum.end');
    const hits = all.filter((r) => !end || String(r.datum).replace(/\./g, '-') <= end);
    const start = (Number(cursor ?? 0) * 2) % hits.length;
    const body = {
      numFound: hits.length,
      cursor: String(Number(cursor ?? 0) + 1),
      documents: hits.slice(start, start + 2),
    };
    return Promise.resolve(new Response(JSON.stringify(body)));
  };
  return { fetcher, calls };
}

const ids = async (client: PardokClient) => {
  const seen: string[] = [];
  await client.list('drucksache', {}, (page) => {
    seen.push(...page.map((e) => e.id));
  });
  return seen;
};

describe('PardokClient.list', () => {
  it('stops at numFound instead of following the cursor back to the start', async () => {
    const { fetcher, calls } = fakePardok();
    const client = new PardokClient(new PoliteGate(0), fetcher, 'key');
    expect(await ids(client)).toEqual(['D-5', 'D-4', 'D-3', 'D-2', 'D-1']);
    expect(calls).toHaveLength(3);
    expect(calls[0].get('f.datum.start')).toBe('2020-01-01');
  });

  it('resumes from the oldest date seen when a cursor turns invalid', async () => {
    const { fetcher, calls } = fakePardok({ invalidCursorAt: '2' });
    const client = new PardokClient(new PoliteGate(0), fetcher, 'key');
    expect(await ids(client)).toEqual(['D-5', 'D-4', 'D-3', 'D-2', 'D-1']);
    const resumed = calls.find((c) => c.has('f.datum.end'));
    expect(resumed?.get('f.datum.end')).toBe('2026-09-02');
    expect(resumed?.has('cursor')).toBe(false);
  });

  it('gives up on any other error', async () => {
    const fetcher: Fetcher = () => Promise.reject(new HttpStatusError(500));
    const client = new PardokClient(new PoliteGate(0), fetcher, 'key');
    await expect(ids(client)).rejects.toBeInstanceOf(HttpStatusError);
  });
});
