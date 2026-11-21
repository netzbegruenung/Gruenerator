/**
 * Was der Index nicht weiss, fragt der Chat live bei Antragsgrün nach:
 *
 * - welche Parteitage es gibt (auch nicht indizierte und solche hinter Login),
 * - den aktuellen Status jedes Dokuments. Während und kurz nach einem Parteitag
 *   ändert er sich stündlich, der Index läuft nur nachts nach.
 *
 * Beides kostet je Parteitag EINEN Abruf (`/rest/{konsultation}` trägt alle
 * Anträge samt Änderungsanträgen und Status). Gecacht im Prozess, damit ein
 * Zug mit mehreren Aufrufen Antragsgrün nicht mehrfach fragt.
 */
import { type AntragsgruenInstance } from '../../config/antragsgruenInstances.js';
import { BRAND } from '../../utils/domainUtils.js';
import { HttpStatusError } from '../scrapers/base/BaseScraper.js';
import {
  AntragsgruenClient,
  type ConsultationRef,
} from '../scrapers/implementations/ParteitageScraper/antragsgruenClient.js';
import {
  amendmentDocumentId,
  motionDocumentId,
  statusOf,
} from '../scrapers/implementations/ParteitageScraper/builders.js';
import { PoliteGate } from '../scrapers/parliament/concurrency.js';

import type { Fetcher } from '../scrapers/parliament/pdfText.js';

const LIST_TTL_MS = 10 * 60_000;
const STATUS_TTL_MS = 5 * 60_000;
/** Ein Chat-Zug wartet nicht länger auf Antragsgrün; danach gilt der Indexstand. */
export const LIVE_TIMEOUT_MS = 6_000;

export interface LiveEntry {
  documentId: string;
  /** Wie im Index formatiert (`statusOf`), z. B. „Beschluss (vorläufig)". */
  status: string;
  kuerzel: string | null;
  /** `true` für Änderungsanträge, auch Satzungsänderungen. */
  amendment: boolean;
}

export interface AntragsgruenLive {
  consultations(): Promise<ConsultationRef[]>;
  /** Alle Anträge und Änderungsanträge eines Parteitags mit aktuellem Status. */
  entries(urlPath: string): Promise<LiveEntry[]>;
}

/** Ein schlichter Abruf mit Frist; Fehlerstatus als `HttpStatusError` wie im Scraper. */
const chatFetcher: Fetcher = async (url, options) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': options.userAgent ?? BRAND.botUserAgent,
      ...(options.headers ?? {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeout ?? LIVE_TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpStatusError(res.status);
  return res;
};

interface Cached<T> {
  at: number;
  value: Promise<T>;
}

function cached<T>(
  store: Map<string, Cached<T>>,
  key: string,
  ttl: number,
  load: () => Promise<T>
) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // Ein Fehlschlag bleibt nicht im Cache: der nächste Aufruf fragt neu.
  value.catch(() => store.delete(key));
  return value;
}

export function entriesOf(
  instance: AntragsgruenInstance,
  overview: Awaited<ReturnType<AntragsgruenClient['consultation']>>
): LiveEntry[] {
  const out: LiveEntry[] = [];
  for (const link of overview.motion_links) {
    if (link.type === 'amendment') {
      out.push({
        documentId: amendmentDocumentId(instance, link.id),
        status: statusOf(link.status_title, link.status_id),
        kuerzel: link.prefix,
        amendment: true,
      });
      continue;
    }
    out.push({
      documentId: motionDocumentId(instance, link.id),
      status: statusOf(link.status_title, link.status_id),
      kuerzel: link.prefix,
      amendment: false,
    });
    for (const a of link.amendment_links) {
      out.push({
        documentId: amendmentDocumentId(instance, a.id),
        status: statusOf(a.status_title, a.status_id),
        kuerzel: a.prefix,
        amendment: true,
      });
    }
  }
  return out;
}

const lists = new Map<string, Cached<ConsultationRef[]>>();
const overviews = new Map<string, Cached<LiveEntry[]>>();

export function getAntragsgruenLive(instance: AntragsgruenInstance): AntragsgruenLive {
  // Kein Abstand nötig: ein Zug fragt höchstens eine Handvoll Seiten.
  const client = new AntragsgruenClient(instance, new PoliteGate(0), chatFetcher);
  const consultations = () =>
    cached(lists, instance.id, LIST_TTL_MS, () => client.listConsultations());
  return {
    consultations,
    entries: (urlPath) =>
      cached(overviews, `${instance.id}/${urlPath}`, STATUS_TTL_MS, async () => {
        const ref = (await consultations()).find((c) => c.url_path === urlPath);
        if (!ref) throw new Error(`unknown consultation: ${urlPath}`);
        return entriesOf(instance, await client.consultation(ref));
      }),
  };
}
