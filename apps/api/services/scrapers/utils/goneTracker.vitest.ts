import { type QdrantClient } from '@qdrant/js-client-rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpStatusError } from '../base/BaseScraper.js';

import { GONE_CONFIRM_AFTER_MS } from './goneState.js';
import { GONE_SINCE_FIELD, GoneTracker } from './goneTracker.js';

const PAGE = 'https://www.gruene.de/artikel/klimaschutz-jetzt';
const now = Date.UTC(2026, 9, 2, 12);
const iso = (ms: number) => new Date(ms).toISOString();

/** Qdrant stand-in: `stored` maps a source_url to the payload of its points. */
function fakeClient(stored: Record<string, Record<string, unknown>>) {
  const urlOf = (args: { filter?: { must?: Array<{ match: { value: string } }> } }) =>
    args.filter?.must?.[0]?.match.value ?? '';
  const client = {
    scroll: vi.fn(async (_c: string, args: { filter?: never }) => {
      const payload = stored[urlOf(args)];
      return { points: payload ? [{ id: 1, payload }] : [] };
    }),
    setPayload: vi.fn(async () => ({})),
    deletePayload: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };
  return {
    client,
    tracker: new GoneTracker(client as unknown as QdrantClient, 'gruene_de_documents'),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe('GoneTracker — 404', () => {
  it('markiert eine gespeicherte Seite beim ersten 404', async () => {
    const { client, tracker } = fakeClient({ [PAGE]: { title: 'x' } });
    await tracker.rejected(PAGE, new HttpStatusError(404));
    expect(client.setPayload).toHaveBeenCalledWith(
      'gruene_de_documents',
      expect.objectContaining({ payload: { [GONE_SINCE_FIELD]: iso(now) } })
    );
    expect(tracker.skipReasons.gone_marked).toEqual({ count: 1, examples: [PAGE] });
  });

  it('löscht erst im flush, wenn die Marke mindestens 24 h alt ist', async () => {
    const { client, tracker } = fakeClient({
      [PAGE]: { [GONE_SINCE_FIELD]: iso(now - GONE_CONFIRM_AFTER_MS) },
    });
    await tracker.rejected(PAGE, new HttpStatusError(410));
    expect(client.delete).not.toHaveBeenCalled();
    await tracker.flush(10);
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(tracker.skipReasons.gone_deleted?.count).toBe(1);
  });

  it('tut nichts für eine URL ohne gespeicherte Punkte', async () => {
    const { client, tracker } = fakeClient({});
    await tracker.rejected(PAGE, new HttpStatusError(404));
    await tracker.flush(1);
    expect(client.setPayload).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('fasst 403, 5xx und Netzfehler nicht an', async () => {
    const { client, tracker } = fakeClient({ [PAGE]: { title: 'x' } });
    await tracker.rejected(PAGE, new HttpStatusError(403));
    await tracker.rejected(PAGE, new HttpStatusError(500));
    await tracker.rejected(PAGE, new Error('socket hang up'));
    expect(client.scroll).not.toHaveBeenCalled();
    expect(client.setPayload).not.toHaveBeenCalled();
  });
});

describe('GoneTracker — Weiterleitungen', () => {
  it('lässt eine Antwort an derselben Adresse durch', async () => {
    const { client, tracker } = fakeClient({ [PAGE]: { title: 'x' } });
    expect(await tracker.answered(PAGE, `${PAGE}/`)).toBe(true);
    expect(await tracker.answered(PAGE, null)).toBe(true);
    expect(client.scroll).not.toHaveBeenCalled();
  });

  it('speichert die Startseite nicht unter der Artikel-URL und markiert stattdessen', async () => {
    const { client, tracker } = fakeClient({ [PAGE]: { title: 'x' } });
    expect(await tracker.answered(PAGE, 'https://www.gruene.de/')).toBe(false);
    expect(client.setPayload).toHaveBeenCalledTimes(1);
  });
});

describe('GoneTracker — Schutzschalter und Fehler', () => {
  it('stellt Löschungen über der Obergrenze zurück', async () => {
    const marked = { [GONE_SINCE_FIELD]: iso(now - 2 * GONE_CONFIRM_AFTER_MS) };
    const urls = Array.from({ length: 6 }, (_, i) => `${PAGE}-${i}`);
    const { client, tracker } = fakeClient(Object.fromEntries(urls.map((u) => [u, marked])));
    for (const url of urls) await tracker.rejected(url, new HttpStatusError(404));
    await tracker.flush(10);
    expect(client.delete).not.toHaveBeenCalled();
    expect(tracker.skipReasons.gone_delete_deferred?.count).toBe(6);
  });

  it('räumt die Marke auf Zuruf', async () => {
    const { client, tracker } = fakeClient({});
    await tracker.clear(PAGE);
    expect(client.deletePayload).toHaveBeenCalledWith(
      'gruene_de_documents',
      expect.objectContaining({ keys: [GONE_SINCE_FIELD] })
    );
  });

  it('wirft bei einem Qdrant-Fehler nicht, sondern sammelt ihn', async () => {
    const { client, tracker } = fakeClient({ [PAGE]: { title: 'x' } });
    client.setPayload.mockRejectedValueOnce(new Error('qdrant down'));
    await expect(tracker.rejected(PAGE, new HttpStatusError(404))).resolves.toBeUndefined();
    expect(tracker.failures).toHaveLength(1);
    expect(tracker.skipReasons.gone_marked).toBeUndefined();
  });
});
