/**
 * Website-Abschriften von Parteitagsbeschlüssen als Dubletten markieren.
 *
 * Die Website eines Landesverbands veröffentlicht die Beschlüsse von LDK und
 * Landesparteirat noch einmal als Beitrag — derselbe Text, ohne Status, ohne
 * Verfahrensvorschläge, ohne Verknüpfung zum Antrag. Stünden beide im Notebook,
 * zitierte eine Antwort denselben Beschluss zweimal, einmal davon ohne Herkunft.
 * Am 15.11.2026 für die LDK Troisdorf gemessen: alle 15 Beschlüsse haben ihren
 * Website-Beitrag mit identischem Titel und identischem Beschlussdatum.
 *
 * Markiert wird nur, was eindeutig ist — eine falsch ausgeblendete Quelle
 * wiegt politisch schwerer als eine doppelte:
 *   - Beschlussdatum gleich (Website: aus dem ersten Satz),
 *   - normalisierter Titel gleich; oder, nur wenn kein Titel exakt passt,
 *     Titelähnlichkeit ≥ 0,9 und deutlich vor jedem anderen Beschluss desselben
 *     Tags (Website „Innovation made in NRW" gegen Antragsgrün „Innovationen
 *     made in NRW", Landesparteirat Krefeld 2025),
 *   - Gremium LDK oder Landesparteirat, und gleich, wo beide es nennen.
 *     Beschlüsse des Landesvorstands stehen nicht in Antragsgrün und bleiben.
 *   - Ein Website-Beitrag, der zu mehr als einem Beschluss passt, bleibt
 *     unmarkiert und wird gemeldet.
 *
 * Die Markierung (`superseded_by` = Dokument-ID des Antragsgrün-Beschlusses)
 * blendet `applyDefaultFilter` überall aus. Gehört ist sie dem Antragsgrün-Lauf:
 * er setzt sie bei jedem Lauf neu und entfernt sie, wenn der Beschluss
 * verschwindet. Schreibt der LV-Scraper einen Beitrag neu, fehlt sie bis zum
 * nächsten Antragsgrün-Lauf — dann steht der Beschluss für höchstens einen Tag doppelt.
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { germanTextDateToIso } from './pageFacts.js';

export const SUPERSEDED_BY_FIELD = 'superseded_by';

type Gremium = 'ldk' | 'lpr' | 'lavo' | null;

export function gremiumOf(text: string | null | undefined): Gremium {
  const t = (text ?? '').toLowerCase();
  if (t.includes('landesdelegiertenkonferenz')) return 'ldk';
  if (t.includes('landesparteirat')) return 'lpr';
  if (t.includes('landesvorstand')) return 'lavo';
  return null;
}

/** „am 21. Juni 2026", „vom 3 . September 2026", „am 16.11. 2025", „vom 02.07.2026" */
export function websiteDateOf(head: string): string | null {
  return germanTextDateToIso(head);
}

const SIMILAR = 0.9;
const MARGIN = 0.15;

/** 1 − Levenshtein-Abstand / Länge des längeren Titels. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / longer;
}

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[„“"'’!?.:,;–—\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AntragsgruenBeschluss {
  documentId: string;
  /** Titel ohne Kürzel, wie im Antrag. */
  title: string;
  beschlossenAm: string;
  beschlussDurch: string | null;
}

export interface WebsiteBeschluss {
  sourceUrl: string;
  title: string;
  /** Anfang des Textes — dort stehen Gremium und Datum. */
  head: string;
}

export interface DuplicateMatch {
  /** Website-URL → Dokument-ID des Antragsgrün-Beschlusses. */
  matches: Map<string, string>;
  /** Website-URLs, die zu mehr als einem Beschluss passen. */
  ambiguous: string[];
}

export function matchWebsiteDuplicates(
  beschluesse: readonly AntragsgruenBeschluss[],
  website: readonly WebsiteBeschluss[]
): DuplicateMatch {
  const matches = new Map<string, string>();
  const ambiguous: string[] = [];
  for (const post of website) {
    const gremium = gremiumOf(post.head.slice(0, 300));
    if (gremium !== 'ldk' && gremium !== 'lpr') continue;
    const date = websiteDateOf(post.head.slice(0, 300));
    if (!date) continue;
    const title = normalizeTitle(post.title);
    const sameDay = beschluesse.filter((b) => {
      const own = gremiumOf(b.beschlussDurch);
      return b.beschlossenAm === date && (own === null || own === gremium);
    });
    const exact = sameDay.filter((b) => normalizeTitle(b.title) === title);
    if (exact.length === 1) matches.set(post.sourceUrl, exact[0].documentId);
    else if (exact.length > 1) ambiguous.push(post.sourceUrl);
    else {
      const ranked = sameDay
        .map((b) => ({ b, score: similarity(normalizeTitle(b.title), title) }))
        .sort((x, y) => y.score - x.score);
      const [best, second] = ranked;
      if (best && best.score >= SIMILAR && (!second || best.score - second.score >= MARGIN)) {
        matches.set(post.sourceUrl, best.b.documentId);
      }
    }
  }
  return { matches, ambiguous };
}

export interface DuplicateSyncResult {
  marked: number;
  cleared: number;
  ambiguous: string[];
}

/**
 * Bringt `superseded_by` auf den Website-Beiträgen in Übereinstimmung mit dem
 * Abgleich: setzen, umhängen oder entfernen. Berührt nur Köpfe der angegebenen
 * Website-Quellen mit `content_type = beschluss`.
 */
export async function syncWebsiteDuplicates(params: {
  client: QdrantClient;
  collection: string;
  websiteSourceIds: readonly string[];
  beschluesse: readonly AntragsgruenBeschluss[];
  dryRun: boolean;
}): Promise<DuplicateSyncResult> {
  const { client, collection, websiteSourceIds } = params;
  const scope = [
    { key: 'source_id', match: { any: [...websiteSourceIds] } },
    { key: 'content_type', match: { value: 'beschluss' } },
  ];
  const heads: Array<WebsiteBeschluss & { current: string | null }> = [];
  let offset: string | number | Record<string, unknown> | null | undefined;
  do {
    const page = await client.scroll(collection, {
      filter: { must: [...scope, { key: 'chunk_index', match: { value: 0 } }] },
      with_payload: ['source_url', 'title', 'chunk_text', SUPERSEDED_BY_FIELD],
      with_vector: false,
      limit: 256,
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    for (const point of page.points) {
      const p = point.payload ?? {};
      if (typeof p.source_url !== 'string') continue;
      heads.push({
        sourceUrl: p.source_url,
        title: typeof p.title === 'string' ? p.title : '',
        head: typeof p.chunk_text === 'string' ? p.chunk_text.slice(0, 400) : '',
        current: typeof p[SUPERSEDED_BY_FIELD] === 'string' ? p[SUPERSEDED_BY_FIELD] : null,
      });
    }
    offset = page.next_page_offset as typeof offset;
  } while (offset !== undefined && offset !== null);

  const { matches, ambiguous } = matchWebsiteDuplicates(params.beschluesse, heads);
  let marked = 0;
  let cleared = 0;
  for (const head of heads) {
    const desired = matches.get(head.sourceUrl) ?? null;
    if (desired === head.current) continue;
    const filter = { must: [...scope, { key: 'source_url', match: { value: head.sourceUrl } }] };
    if (desired) {
      marked += 1;
      if (!params.dryRun) {
        await client.setPayload(collection, {
          payload: { [SUPERSEDED_BY_FIELD]: desired },
          filter,
          wait: true,
        });
      }
    } else {
      cleared += 1;
      if (!params.dryRun) {
        await client.deletePayload(collection, { keys: [SUPERSEDED_BY_FIELD], filter, wait: true });
      }
    }
  }
  return { marked, cleared, ambiguous };
}
