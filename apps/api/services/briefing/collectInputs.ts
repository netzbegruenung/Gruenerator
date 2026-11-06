/**
 * Alles, was das Tagesbriefing über eine Person wissen muss — parallel gelesen,
 * jede Quelle für sich mit Rückfall auf „leer", damit eine ausgefallene Quelle
 * nur ihren Abschnitt kostet und nicht das Briefing.
 */
import { LANDESVERBAENDE, landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { type UserRole } from '@gruenerator/shared/roles';

import { getCollectionDefaultFilter } from '../../config/systemCollectionsConfig.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { listMyOpenCards, type MyOpenCard } from '../boards/myOpenCards.js';
import { getRecentLvArticlesFor } from '../monitor/ContentSyncEventsService.js';

import { getLagebild } from './lagebild.js';
import { getRecentPartyNews } from './partyNews.js';
import { berlinDay } from './time.js';

import type {
  BriefingInputs,
  BriefingLocale,
  Lagebild,
  LvNewsItem,
  RecentWorkItem,
} from './types.js';

const log = createLogger('briefing:inputs');

/** Wie weit „zuletzt" zurückreicht. */
const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;
/** LV-Neuigkeiten: nur, was in den letzten drei Tagen erschienen ist. */
const LV_NEWS_DAYS = 3;
const LV_NEWS_LIMIT = 2;
const PARTY_NEWS_LIMIT = 1;

export interface BriefingProfile {
  firstName: string | null;
  locale: BriefingLocale;
  enabled: boolean;
  hasConsent: boolean;
  roles: UserRole[];
}

/** Der Vorname: `first_name`, sonst das erste Wort des Anzeigenamens. */
export function firstNameOf(firstName: string | null, displayName: string | null): string | null {
  const own = firstName?.trim();
  if (own) return own;
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

export async function loadBriefingProfile(userId: string): Promise<BriefingProfile | null> {
  const rows = (await getPostgresInstance().query(
    `SELECT first_name, display_name, locale, ai_consent_at, proactive_briefing_enabled,
            user_defaults->'profile'->'roles' AS roles
     FROM profiles WHERE id = $1`,
    [userId]
  )) as Array<{
    first_name: string | null;
    display_name: string | null;
    locale: string | null;
    ai_consent_at: Date | string | null;
    proactive_briefing_enabled: boolean | null;
    roles: unknown;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    firstName: firstNameOf(row.first_name, row.display_name),
    locale: row.locale === 'de-AT' ? 'de-AT' : 'de-DE',
    enabled: row.proactive_briefing_enabled !== false,
    hasConsent: row.ai_consent_at != null,
    roles: Array.isArray(row.roles) ? (row.roles as UserRole[]) : [],
  };
}

/** „Mitarbeiter*in MdB-Büro, Kreisverband Köln, Nordrhein-Westfalen" — oder null. */
export function roleContextLine(role: UserRole | undefined): string | null {
  if (!role?.rolle) return null;
  const parts = [role.rolle];
  if (role.gliederung) parts.push(role.gliederung);
  if (role.bundesland) parts.push(role.bundesland);
  if (role.abgeordnete) parts.push(`Büro von ${role.abgeordnete}`);
  return parts.join(', ');
}

async function safe<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    log.warn(`${label} unavailable: ${(error as Error).message}`);
    return fallback;
  }
}

function asTags(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
}

async function loadRecentWork(userId: string): Promise<RecentWorkItem[]> {
  const db = getPostgresInstance();
  const [chats, docs] = await Promise.all([
    db.query(
      `SELECT t.id, t.title, COALESCE(t.tags, '[]'::jsonb) AS tags, t.updated_at
       FROM chat_threads t
       WHERE t.user_id = $1 AND t.deleted_at IS NULL
         AND COALESCE(t.status, 'regular') = 'regular'
         AND COALESCE(t.thread_type, 'chat') = 'chat' AND t.doc_id IS NULL
         AND t.title IS NOT NULL AND btrim(t.title) <> ''
         AND t.updated_at > now() - make_interval(days => $2)
         AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id = t.id AND m.role = 'user')
         AND NOT EXISTS (SELECT 1 FROM daily_briefings b WHERE b.thread_id = t.id)
       ORDER BY t.updated_at DESC
       LIMIT $3`,
      [userId, RECENT_DAYS, RECENT_LIMIT]
    ) as Promise<Array<{ id: string; title: string; tags: unknown; updated_at: Date | string }>>,
    db.query(
      `SELECT cd.id, cd.title, cd.document_subtype, cd.updated_at
       FROM collaborative_documents cd
       WHERE cd.created_by = $1 AND cd.is_deleted = false AND cd.deleted_at IS NULL
         AND COALESCE(cd.document_subtype, '') <> 'boards'
         AND cd.title IS NOT NULL AND btrim(cd.title) <> ''
         AND cd.updated_at > now() - make_interval(days => $2)
       ORDER BY cd.updated_at DESC
       LIMIT $3`,
      [userId, RECENT_DAYS, RECENT_LIMIT]
    ) as Promise<
      Array<{
        id: string;
        title: string;
        document_subtype: string | null;
        updated_at: Date | string;
      }>
    >,
  ]);
  const toDay = (d: Date | string) => berlinDay(new Date(d));
  return [
    ...chats.map((c, i) => ({
      ref: `c${i + 1}`,
      kind: 'chat' as const,
      title: c.title.trim(),
      detail: asTags(c.tags).join(', ') || null,
      day: toDay(c.updated_at),
    })),
    ...docs.map((d, i) => ({
      ref: `d${i + 1}`,
      kind: 'document' as const,
      title: d.title.trim(),
      detail: d.document_subtype,
      day: toDay(d.updated_at),
    })),
  ];
}

/**
 * Der Landesverband für die LV-Zeile: nur bei Landesgeschäftsstellen-Rolle
 * (`landesverbandIdsForRoles` ist ausschließend), nur deutsche LVs — die
 * österreichische Sammlung enthält Programme, keine datierten Neuigkeiten.
 */
export function lvForRoles(
  roles: UserRole[],
  locale: BriefingLocale
): { name: string; codes: string[] } | null {
  for (const id of landesverbandIdsForRoles(roles, locale)) {
    const filter = getCollectionDefaultFilter(`${id}-system`);
    const lv = LANDESVERBAENDE.find((entry) => entry.id === id);
    if (!filter || filter.field !== 'landesverband' || !lv) continue;
    const codes = Array.isArray(filter.value) ? filter.value : [filter.value];
    return { name: lv.title, codes };
  }
  return null;
}

async function loadLvNews(lv: { codes: string[] } | null): Promise<LvNewsItem[]> {
  if (!lv) return [];
  const articles = await getRecentLvArticlesFor(lv.codes, LV_NEWS_DAYS, LV_NEWS_LIMIT);
  return articles.map((a) => ({
    title: a.title,
    url: a.sourceUrl,
    sourceName: a.sourceName,
    day: (a.publishedAt ?? a.indexedAt).slice(0, 10),
  }));
}

export async function collectBriefingInputs(
  userId: string,
  profile: BriefingProfile
): Promise<BriefingInputs> {
  const lv = lvForRoles(profile.roles, profile.locale);
  const [cards, lagebild, lvNews, partyNews, recent] = await Promise.all([
    safe<MyOpenCard[]>('open cards', [], () => listMyOpenCards(userId)),
    safe<Lagebild | null>('lagebild', null, () =>
      getLagebild(profile.locale === 'de-AT' ? 'at' : 'de')
    ),
    safe<LvNewsItem[]>('lv news', [], () => loadLvNews(lv)),
    safe<LvNewsItem[]>('party news', [], () =>
      getRecentPartyNews(profile.locale, LV_NEWS_DAYS, PARTY_NEWS_LIMIT)
    ),
    safe<RecentWorkItem[]>('recent work', [], () => loadRecentWork(userId)),
  ]);
  const firstRole = profile.roles[0];
  return {
    userId,
    firstName: profile.firstName,
    locale: profile.locale,
    roleLine: roleContextLine(firstRole),
    ebene: firstRole?.ebene ?? null,
    cards,
    lagebild,
    lvName: lvNews.length > 0 && lv ? lv.name : null,
    lvNews,
    partyNews,
    recent,
  };
}
