/**
 * „Beliebte Vorlagen" für die Studio-Startseite: Grünerator-Katalog des Landes
 * und öffentliche Galerie-Vorlagen (Canva, Grünerator-Canvas, …) gemischt in
 * einer Liste.
 *
 * 1. Was Likes oder Reaktionen hat, nach deren Summe — Gleichstand: neuere
 *    Nutzer-Vorlage zuerst, Katalog (ohne Datum) danach in Katalog-Reihenfolge.
 * 2. Reicht das nicht, füllen die neuesten auf — abwechselnd Katalog und
 *    Nutzer-Vorlagen (nach `created_at`), beginnend mit dem Katalog. Der
 *    Katalog hat kein Datum; „Katalog nach allen Datierten" ließe ihn bei einer
 *    vollen Galerie nie erscheinen, obwohl die Zeile gemischt sein soll.
 */
import {
  type GalleryTemplate,
  type PopularVorlage,
  type SharepicVorlage,
} from '@gruenerator/contracts';

import { buildGalleryTemplates } from '../../routes/auth/templates/templateGallery.js';
import { listSharepicVorlagen } from '../sharepicVorlagen/catalog.js';

import { getTemplateEngagement, getTemplateScores } from './templateEngagement.js';

export type PopularCandidate =
  | { kind: 'catalog'; id: string; vorlage: SharepicVorlage }
  | { kind: 'user'; id: string; template: Record<string, unknown>; createdAt: number };

/** Wie viele bestbewertete ids höchstens betrachtet werden. */
const SCORED_POOL = 200;

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

export function rankPopular(
  catalog: PopularCandidate[],
  users: PopularCandidate[],
  scores: Map<string, number>,
  limit: number
): PopularCandidate[] {
  const order = new Map([...catalog, ...users].map((c, i) => [c.id, i]));
  const createdAt = (c: PopularCandidate) => (c.kind === 'user' ? c.createdAt : -Infinity);
  const score = (c: PopularCandidate) => scores.get(c.id) ?? 0;

  const ranked = [...catalog, ...users]
    .filter((c) => score(c) > 0)
    .sort(
      (a, b) =>
        score(b) - score(a) || createdAt(b) - createdAt(a) || order.get(a.id)! - order.get(b.id)!
    )
    .slice(0, limit);

  const taken = new Set(ranked.map((c) => c.id));
  const free = (c: PopularCandidate) => !taken.has(c.id);
  const newestUsers = users.filter(free).sort((a, b) => createdAt(b) - createdAt(a));
  return [...ranked, ...interleave(catalog.filter(free), newestUsers)].slice(0, limit);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUserCandidate(t: Record<string, unknown>): PopularCandidate {
  const time = new Date(String(t.created_at ?? '')).getTime();
  return {
    kind: 'user',
    id: String(t.id),
    template: t,
    createdAt: Number.isNaN(time) ? 0 : time,
  };
}

export async function listPopularVorlagen(
  locale: 'de-DE' | 'de-AT',
  viewerId: string,
  limit: number
): Promise<PopularVorlage[]> {
  const scores = await getTemplateScores(SCORED_POOL);
  const scoredUserIds = [...scores.keys()].filter((id) => UUID_RE.test(id));

  const [scoredUsers, newestUsers] = await Promise.all([
    scoredUserIds.length > 0
      ? buildGalleryTemplates({ audience: locale, ids: scoredUserIds })
      : Promise.resolve([]),
    buildGalleryTemplates({ audience: locale, limit }),
  ]);

  const seen = new Set<string>();
  const users = [...scoredUsers, ...newestUsers]
    .filter((t) => !seen.has(String(t.id)) && seen.add(String(t.id)))
    .map(toUserCandidate);
  const catalog: PopularCandidate[] = listSharepicVorlagen(locale).map((v) => ({
    kind: 'catalog',
    id: v.id,
    vorlage: v,
  }));

  const picked = rankPopular(catalog, users, scores, limit);
  const engagement = new Map(
    (
      await getTemplateEngagement(
        picked.map((c) => c.id),
        viewerId
      )
    ).map((e) => [e.id, e])
  );

  return picked.map((c) => {
    const { likes_count, reactions } = engagement.get(c.id) ?? { likes_count: 0, reactions: [] };
    return c.kind === 'catalog'
      ? { kind: 'catalog', vorlage: c.vorlage, likes_count, reactions }
      : {
          kind: 'user',
          // Gallery rows are a loose Record merge carrying an `id`, matching the passthrough schema.
          template: { ...c.template, likes_count } as GalleryTemplate,
          likes_count,
          reactions,
        };
  });
}
