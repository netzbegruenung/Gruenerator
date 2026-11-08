/**
 * Das geteilte Lagebild des Tagesbriefings: je Monitor-Locale bis zu zwei
 * Zeilen „Grüne in den Medien" und zwei Zeilen „Welt", jede mit einer Quelle.
 *
 * Erzeugt wird es stündlich im Monitor-Refresh (`refreshMonitor` →
 * `refreshLagebild`), nie im Login-Pfad. Abgelegt in Postgres
 * (`monitor_lagebilder`) und Redis; gelesen wird Redis → Postgres → null.
 *
 * Das Modell WÄHLT nur aus: welche Meldungen wichtig sind, über ihre Kurz-Id
 * (`q3`). Angezeigt wird die Original-Schlagzeile mit der Domain als Quelle —
 * eine Nacherzählung aus dem Titel allein hat im ersten echten Lauf Namen
 * erfunden („Robert Özdemir") und eine Schlagzeile über eine reale Person ins
 * Gegenteil gedreht. Was nicht umformuliert wird, kann nicht verfälscht werden.
 */
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { aiObject } from '../ai/generate.js';

import { BRIEFING_LANE, BRIEFING_MODEL } from './model.js';

import type { Lagebild, LagebildItem } from './types.js';
import type { StructuredValidation } from '../ai/structuredParsing.js';
import type { MonitorArticle, MonitorLocale, TopicScore } from '../monitor/types.js';

const log = createLogger('briefing:lagebild');

const CACHE_TTL_SECONDS = 2 * 60 * 60;
/** Ein Lagebild, das älter ist, gilt als veraltet: lieber kein Abschnitt als die Nachrichten von gestern. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const KEEP_ROWS_PER_LOCALE = 48;
const PARTY_ARTICLES = 8;
const WORLD_TOPICS = 4;
const ARTICLES_PER_TOPIC = 3;
const SUMMARY_CHARS = 1500;

const lagebildItemSchema = z.object({
  kind: z.enum(['partei', 'welt']),
  topic: z.string().nullable(),
  text: z.string().min(1),
  url: z.string().min(1),
  source: z.string(),
});
const lagebildSchema = z.object({
  locale: z.enum(['de', 'at']),
  generatedAt: z.string(),
  items: z.array(lagebildItemSchema),
});

function cacheKey(locale: MonitorLocale): string {
  return `briefing:lagebild:v1:${locale}`;
}

/** Eine Quelle, die das Modell auswählen darf. */
export interface LagebildCandidate {
  id: string;
  kind: 'partei' | 'welt';
  topic: string | null;
  title: string;
  source: string;
  url: string;
}

export function buildCandidates(
  partyArticles: readonly MonitorArticle[],
  topics: readonly TopicScore[]
): LagebildCandidate[] {
  const out: LagebildCandidate[] = [];
  const seen = new Set<string>();
  const push = (kind: 'partei' | 'welt', topic: string | null, a: MonitorArticle) => {
    if (seen.has(a.url) || !a.title.trim()) return;
    seen.add(a.url);
    out.push({
      id: `q${out.length + 1}`,
      kind,
      topic,
      title: a.title,
      source: a.source,
      url: a.url,
    });
  };
  for (const a of partyArticles.slice(0, PARTY_ARTICLES)) push('partei', null, a);
  const ranked = [...topics].sort((x, y) => y.score - x.score).slice(0, WORLD_TOPICS);
  for (const t of ranked) {
    for (const a of t.topArticles.slice(0, ARTICLES_PER_TOPIC)) push('welt', t.topic, a);
  }
  return out;
}

const modelOutputSchema = z.object({
  items: z.array(z.object({ sourceId: z.string() }).passthrough()),
});

/** „spiegel.de" statt „DER SPIEGEL - Schlagzeilen": der Feed-Name ist kein Anzeigename. */
export function sourceLabel(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

/**
 * Prüft die Modellantwort gegen die Kandidaten: jede Quelle muss existieren,
 * je Art höchstens zwei Zeilen, Sätze kurz. Gibt die fertigen Zeilen zurück.
 */
export function validateLagebildOutput(
  input: unknown,
  candidates: readonly LagebildCandidate[]
): StructuredValidation<LagebildItem[]> {
  const parsed = modelOutputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items: LagebildItem[] = [];
  const perKind = { partei: 0, welt: 0 };
  const used = new Set<string>();
  for (const item of parsed.data.items) {
    const candidate = byId.get(item.sourceId.trim());
    if (!candidate) return { ok: false, error: `Unbekannte Quelle "${item.sourceId}".` };
    if (used.has(candidate.id)) continue;
    if (perKind[candidate.kind] >= 2) continue;
    perKind[candidate.kind] += 1;
    used.add(candidate.id);
    items.push({
      kind: candidate.kind,
      topic: candidate.topic,
      text: candidate.title.trim(),
      url: candidate.url,
      source: sourceLabel(candidate.url, candidate.source),
    });
  }
  if (items.length === 0) return { ok: false, error: 'Keine einzige gültige Zeile.' };
  return { ok: true, value: items };
}

const SYSTEM_DE = `Du stellst das Lagebild für das Tagesbriefing von Grünen-Aktiven zusammen: höchstens zwei Meldungen dazu, wie die Grünen gerade in den Medien vorkommen, und höchstens zwei dazu, was in der Welt los ist.

Du schreibst dafür nichts selbst: du WÄHLST aus der Quellenliste die Meldungen aus, deren Schlagzeile angezeigt wird, und gibst nur ihre Kurz-Ids (sourceId) zurück.
- Höchstens zwei Meldungen der Art „Grüne", höchstens zwei der Art „Welt".
- Wähle das politisch Wichtigste und Relevanteste für Grünen-Aktive, nicht das Kurioseste. Keine zwei Meldungen zum selben Ereignis.
- Bevorzuge Schlagzeilen, die für sich allein verständlich sind.`;

const SYSTEM_AT = `${SYSTEM_DE}

## LÄNDERKONTEXT: ÖSTERREICH
Die Leser*innen sind in Österreich aktiv. Wähle bevorzugt Meldungen, die für Österreich relevant sind (Nationalrat, Bundesregierung, Landespolitik, EU).`;

function promptFor(summary: string | null, candidates: readonly LagebildCandidate[]): string {
  const lines = candidates.map(
    (c) =>
      `${c.id} | ${c.kind === 'partei' ? 'Grüne' : `Welt/${c.topic ?? 'allgemein'}`} | ${c.source} | ${c.title}`
  );
  const summaryBlock = summary
    ? `## Medien-Briefing zu den Grünen (Zusammenfassung)\n${summary.slice(0, SUMMARY_CHARS)}\n\n`
    : '';
  return `${summaryBlock}## Quellen (Kurz-Id | Art | Medium | Titel)\n${lines.join('\n')}\n\nGib das Lagebild über das Tool lagebild_abgeben ab.`;
}

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Höchstens zwei Partei- und zwei Welt-Meldungen.',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Kurz-Id der Quelle, z. B. q3' },
        },
        required: ['sourceId'],
      },
    },
  },
  required: ['items'],
};

export interface LagebildSource {
  locale: MonitorLocale;
  partySummary: string | null;
  partyArticles: readonly MonitorArticle[];
  topics: readonly TopicScore[];
}

/** Ein Modellaufruf; null, wenn es keine Quellen gibt oder nichts Gültiges zurückkam. */
export async function buildLagebild(source: LagebildSource): Promise<Lagebild | null> {
  const candidates = buildCandidates(source.partyArticles, source.topics);
  if (candidates.length === 0) return null;
  const result = await aiObject<LagebildItem[]>({
    lane: BRIEFING_LANE,
    pinned: BRIEFING_MODEL,
    system: source.locale === 'at' ? SYSTEM_AT : SYSTEM_DE,
    prompt: promptFor(source.partySummary, candidates),
    toolName: 'lagebild_abgeben',
    toolDescription: 'Gib die Kurz-Ids der ausgewählten Meldungen ab.',
    schema: TOOL_SCHEMA,
    validate: (input) => validateLagebildOutput(input, candidates),
    temperature: 0.3,
    maxOutputTokens: 8000,
    timeoutMs: 30_000,
    label: 'briefing:lagebild',
  });
  if (!result.ok) {
    log.warn(`Lagebild ${source.locale} not built: ${result.error}`);
    return null;
  }
  return { locale: source.locale, generatedAt: new Date().toISOString(), items: result.data };
}

async function storeLagebild(lagebild: Lagebild): Promise<void> {
  const db = getPostgresInstance();
  await db.query(
    `INSERT INTO monitor_lagebilder (locale, generated_at, payload) VALUES ($1, $2, $3)`,
    [lagebild.locale, lagebild.generatedAt, JSON.stringify(lagebild)]
  );
  await db.query(
    `DELETE FROM monitor_lagebilder
     WHERE locale = $1 AND id NOT IN (
       SELECT id FROM monitor_lagebilder WHERE locale = $1 ORDER BY generated_at DESC LIMIT $2
     )`,
    [lagebild.locale, KEEP_ROWS_PER_LOCALE]
  );
  await setCachedJson(cacheKey(lagebild.locale), lagebild, CACHE_TTL_SECONDS);
}

/** Erzeugen und ablegen; der Monitor-Refresh ruft das je Locale. Wirft nicht. */
export async function refreshLagebild(source: LagebildSource): Promise<Lagebild | null> {
  try {
    const lagebild = await buildLagebild(source);
    if (lagebild) await storeLagebild(lagebild);
    return lagebild;
  } catch (error) {
    log.warn(`Lagebild ${source.locale} refresh failed: ${(error as Error).message}`);
    return null;
  }
}

/** Ein bereits gebautes Lagebild ablegen (Dev-Musterdaten). */
export async function saveLagebild(lagebild: Lagebild): Promise<void> {
  await storeLagebild(lagebild);
}

function isFresh(lagebild: Lagebild, now: Date): boolean {
  return now.getTime() - Date.parse(lagebild.generatedAt) <= MAX_AGE_MS;
}

/** Das jüngste Lagebild, oder null, wenn keins da oder es veraltet ist. Kein Modellaufruf. */
export async function getLagebild(
  locale: MonitorLocale,
  now = new Date()
): Promise<Lagebild | null> {
  const cached = await getCachedJson(cacheKey(locale), lagebildSchema);
  if (cached) return isFresh(cached, now) ? cached : null;
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT payload FROM monitor_lagebilder WHERE locale = $1 ORDER BY generated_at DESC LIMIT 1`,
      [locale]
    )) as Array<{ payload: unknown }>;
    const parsed = lagebildSchema.safeParse(rows[0]?.payload);
    if (!parsed.success) return null;
    await setCachedJson(cacheKey(locale), parsed.data, CACHE_TTL_SECONDS);
    return isFresh(parsed.data, now) ? parsed.data : null;
  } catch (error) {
    log.warn(`Lagebild ${locale} read failed: ${(error as Error).message}`);
    return null;
  }
}
