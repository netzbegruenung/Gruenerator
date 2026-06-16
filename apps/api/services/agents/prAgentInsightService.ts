/**
 * Monthly corpus-derived insight refresh for the Öffentlichkeitsarbeit (PR) agents.
 *
 * The hand-tuned `systemRole` of each PR agent stays in code (single source of
 * truth in `@gruenerator/shared/agents`). This service samples each agent's own
 * corpus slice (press from `landesverbaende_documents`, social from
 * `social_media_examples`, scoped by the agent's `defaultFilter.landesverband` /
 * `examplesCountry`), asks an LLM to distill the *current* empirical deltas
 * (dominant themes, recurrent speakers, style tics, fresh real-post examples),
 * validates the output against the corpus, and persists it to
 * `pr_agent_insight_snapshots`. At chat time the ChatGraph respond node injects
 * the latest `active` row as an additive block (see `respondNode.buildSystemMessage`).
 *
 * Fully automatic — there is no human review gate, so the server-side validation
 * in `analyzeScope` is the quality gate. A snapshot that fails validation is
 * stored as `status='rejected'`; the reader falls back to the last `active` month.
 *
 * Mirrors `services/notebook/notebookKeywordSnapshotService.ts` (sampling, upsert,
 * refresh-all loop, getLatest reader) and `scripts/extractRicardaLangStyle.ts`
 * (corpus → LLM meta-prompt analysis).
 */
import { SYSTEM_AGENTS, type Agent } from '@gruenerator/shared/agents';

import { env } from '../../config/env.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { isEmailConfigured, sendEmail } from '../email/emailService.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';

const log = createLogger('prAgentInsights');

const PR_AGENT_PREFIX = 'gruenerator-oeffentlichkeitsarbeit';
const PRESS_COLLECTION = 'landesverbaende_documents';
const PRESS_COLLECTION_AT = 'oesterreich_gruene_documents';
const SOCIAL_COLLECTION = 'social_media_examples';

const PRESS_SAMPLE = 40;
const SOCIAL_SAMPLE = 40;
const TEXT_CHARS_PER_DOC = 1500;
const MIN_SAMPLE = 8; // below this we don't trust the analysis — keep last month
const INSIGHTS_BLOCK_MAX_CHARS = 1500;
const MAX_FEW_SHOT = 2;
const ANALYSIS_MODEL = 'mistral-large-latest';
const LONG_WORD_MIN = 6; // word length that counts as a corpus-traceable token

interface PrAgentScope {
  identifier: string;
  title: string;
  /** Landesverband codes from defaultFilter.landesverband, e.g. ['BE','BE-F']; [] for the general agent. */
  landesverbandCodes: string[];
  country: 'DE' | 'AT';
}

interface SampledDoc {
  id: string;
  title: string;
  text: string;
  source: 'press' | 'social';
  date: string | null;
}

interface ThemeInsight {
  theme: string;
  gloss: string;
  evidence_quote: string;
}

interface SpeakerInsight {
  name: string;
  role: string;
}

interface FewShotInsight {
  input: string;
  output: string;
  reasoning: string;
}

export interface PrAgentInsightRecord {
  agentIdentifier: string;
  month: string;
  insightsBlock: string;
  fewShotExamples: FewShotInsight[];
  themes: ThemeInsight[];
  speakers: SpeakerInsight[];
  status: 'active' | 'rejected';
  sourceCollection: string | null;
  sampleSize: number;
  model: string | null;
  computedAt: string;
}

export interface RefreshResult {
  agentIdentifier: string;
  month: string;
  status: 'active' | 'rejected';
  sampleSize: number;
  themeCount: number;
  speakerCount: number;
  fewShotCount: number;
  droppedSpeakers: number;
  droppedThemes: number;
  droppedFewShot: number;
  durationMs: number;
  error?: string;
}

function db() {
  return getPostgresInstance();
}

function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Derive the work-list straight from the agent registry so scoping stays in
 * lockstep with the agent definitions (single source of truth). Any system
 * agent whose identifier starts with the PR prefix is in scope.
 */
export function getPrAgentScopes(): PrAgentScope[] {
  return (SYSTEM_AGENTS as readonly Agent[])
    .filter((a) => a.identifier.startsWith(PR_AGENT_PREFIX))
    .map((a) => {
      const lv = a.defaultFilter?.landesverband;
      const landesverbandCodes = lv === undefined ? [] : typeof lv === 'string' ? [lv] : [...lv];
      const country: 'DE' | 'AT' = a.toolRestrictions?.examplesCountry === 'AT' ? 'AT' : 'DE';
      return { identifier: a.identifier, title: a.title, landesverbandCodes, country };
    });
}

function lvFilter(codes: string[]): QdrantFilter | undefined {
  if (codes.length === 0) return undefined;
  return {
    must: [
      {
        key: 'landesverband',
        match: codes.length === 1 ? { value: codes[0] as string } : { any: codes },
      },
    ],
  };
}

function countryFilter(country: 'DE' | 'AT'): QdrantFilter {
  return { must: [{ key: 'country', match: { value: country } }] };
}

async function scroll(
  collection: string,
  filter: QdrantFilter | undefined,
  limit: number
): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.operations) return [];
  return qdrant.operations.scrollDocuments(collection, filter, {
    limit: limit * 4,
    withPayload: true,
  });
}

/** Sample recent press releases for this scope (deduped to first chunks). */
async function samplePress(scope: PrAgentScope): Promise<SampledDoc[]> {
  const collection = scope.country === 'AT' ? PRESS_COLLECTION_AT : PRESS_COLLECTION;
  // LV filter only applies to the multi-LV landesverbaende_documents collection.
  const filter = collection === PRESS_COLLECTION ? lvFilter(scope.landesverbandCodes) : undefined;
  const points = await scroll(collection, filter, PRESS_SAMPLE);

  const docs: SampledDoc[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    const payload = p.payload;
    const chunkIndex = payload.chunk_index;
    if (typeof chunkIndex === 'number' && chunkIndex !== 0) continue;
    const url = typeof payload.source_url === 'string' ? payload.source_url : null;
    const key = url ?? String(p.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = typeof payload.chunk_text === 'string' ? payload.chunk_text : '';
    if (!text) continue;
    docs.push({
      id: String(p.id),
      title: typeof payload.title === 'string' ? payload.title : '',
      text: text.slice(0, TEXT_CHARS_PER_DOC),
      source: 'press',
      date: typeof payload.published_at === 'string' ? payload.published_at : null,
    });
    if (docs.length >= PRESS_SAMPLE) break;
  }
  return docs;
}

/**
 * Sample recent social posts. The `landesverband` field is not yet reliably set
 * on `social_media_examples` (Apify follow-up), so we scope by country and, when
 * the agent is LV-specific, *try* an LV filter first and fall back to country-only
 * if it yields too little — never zeroing out the social signal.
 */
async function sampleSocial(scope: PrAgentScope): Promise<SampledDoc[]> {
  const mapPoints = (
    points: Array<{ id: string | number; payload: Record<string, unknown> }>
  ): SampledDoc[] => {
    const out: SampledDoc[] = [];
    const seen = new Set<string>();
    for (const p of points) {
      const payload = p.payload;
      const content = typeof payload.content === 'string' ? payload.content : '';
      if (!content || content.length < 20) continue;
      const key = String(payload.example_id ?? p.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const account = typeof payload.source_account === 'string' ? payload.source_account : '';
      const platform = typeof payload.platform === 'string' ? payload.platform : 'social';
      out.push({
        id: String(p.id),
        title: `${platform}${account ? ` @${account}` : ''}`,
        text: content.slice(0, TEXT_CHARS_PER_DOC),
        source: 'social',
        date: typeof payload.created_at === 'string' ? payload.created_at : null,
      });
      if (out.length >= SOCIAL_SAMPLE) break;
    }
    return out;
  };

  if (scope.landesverbandCodes.length > 0) {
    const lv = lvFilter(scope.landesverbandCodes);
    const combined: QdrantFilter = {
      must: [...(countryFilter(scope.country).must ?? []), ...(lv?.must ?? [])],
    };
    const lvDocs = mapPoints(await scroll(SOCIAL_COLLECTION, combined, SOCIAL_SAMPLE));
    if (lvDocs.length >= MIN_SAMPLE) return lvDocs;
    log.info(
      `[${scope.identifier}] social LV filter yielded ${lvDocs.length} (<${MIN_SAMPLE}) — falling back to country-only`
    );
  }
  return mapPoints(await scroll(SOCIAL_COLLECTION, countryFilter(scope.country), SOCIAL_SAMPLE));
}

const META_PROMPT = `Du bist eine erfahrene Sprach- und Kommunikationsanalystin. Du analysierst die letzten echten Veröffentlichungen (Pressemitteilungen + Social-Media-Posts) eines grünen Landesverbands und destillierst daraus die AKTUELLEN empirischen Beobachtungen für ein Kommunikations-Assistenzsystem.

WICHTIG — Grenzen deiner Aufgabe:
- Du ergänzt NUR aktuelle empirische Beobachtungen. Du veränderst NICHT die Persona, die Regeln oder die Struktur des Agenten.
- Jede Behauptung muss durch ein wörtliches Zitat aus dem Korpus belegt sein.
- Erfinde KEINE Namen, Rollen, Themen oder Zitate. Nutze ausschließlich, was im Korpus unten tatsächlich vorkommt.

Gib AUSSCHLIESSLICH gültiges JSON zurück (kein Markdown, keine Code-Fences, kein Fließtext davor/danach), exakt in diesem Schema:
{
  "dominant_themes": [{ "theme": "kurzer Themenname", "gloss": "ein Satz, worum es geht", "evidence_quote": "wörtliches Zitat aus dem Korpus" }],
  "recurrent_speakers": [{ "name": "vollständiger Name", "role": "Funktion/Rolle laut Korpus" }],
  "stylistic_tics": ["kurze Beobachtung zu aktuell häufigen Formulierungen/Openern"],
  "few_shot_examples": [{ "input": "knapper Anlass/Auftrag", "output": "ein echter, jüngster Post/Absatz aus dem Korpus, wörtlich", "reasoning": "ein Satz, welches Stilelement er zeigt" }]
}

Regeln für die Felder:
- dominant_themes: 5–8 Einträge, je mit wörtlichem Beleg-Zitat.
- recurrent_speakers: nur Personen, die real im Korpus als Sprecher*innen/Zitierte vorkommen.
- stylistic_tics: 3–6 kurze, konkrete Beobachtungen.
- few_shot_examples: 1–2 echte, jüngste, stilbildende Beispiele — output WÖRTLICH aus dem Korpus.
- Alles auf Deutsch.

Hier ist der Korpus (jeweils mit Quelle und Datum):

`;

function buildCorpusText(docs: SampledDoc[]): string {
  return docs
    .map((d, i) => {
      const date = d.date ? d.date.slice(0, 10) : 'unbekannt';
      const label = d.source === 'press' ? 'PRESSE' : 'SOCIAL';
      const head = d.title ? `${d.title} — ` : '';
      return `[${i + 1}] (${label}, ${date}) ${head}${d.text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n\n');
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced && fenced[1]) return fenced[1].trim();
  // Fall back to the first {...} block if the model added prose around it.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function longWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-zäöüß]{6,}/g) ?? []).filter(
    (w) => w.length >= LONG_WORD_MIN
  );
}

interface AnalysisOutcome {
  themes: ThemeInsight[];
  speakers: SpeakerInsight[];
  tics: string[];
  fewShot: FewShotInsight[];
  dropped: { speakers: number; themes: number; fewShot: number };
}

/**
 * Call the LLM and validate its output against the sampled corpus. Validation is
 * the only quality gate (no human review):
 * - speakers must appear verbatim (case-insensitive) in the corpus,
 * - themes must carry an evidence quote with at least one long word found in the corpus,
 * - few-shot outputs must share enough vocabulary with the corpus to be traceable.
 */
async function analyzeScope(scope: PrAgentScope, docs: SampledDoc[]): Promise<AnalysisOutcome> {
  const { generateText } = await import('ai');
  const { getModel } = await import('../ai/providers.js');

  const corpusText = buildCorpusText(docs);
  const corpusLower = corpusText.toLowerCase();
  const corpusWordSet = new Set(longWords(corpusText));

  const model = getModel('mistral', ANALYSIS_MODEL);
  const result = await generateText({
    model,
    prompt: META_PROMPT + corpusText,
    temperature: 0.25,
    maxOutputTokens: 4000,
  });

  let parsed: {
    dominant_themes?: unknown;
    recurrent_speakers?: unknown;
    stylistic_tics?: unknown;
    few_shot_examples?: unknown;
  };
  try {
    parsed = JSON.parse(stripJsonFences(result.text)) as typeof parsed;
  } catch (err) {
    log.warn(`[${scope.identifier}] analysis JSON parse failed: ${toError(err).message}`);
    return {
      themes: [],
      speakers: [],
      tics: [],
      fewShot: [],
      dropped: { speakers: 0, themes: 0, fewShot: 0 },
    };
  }

  const dropped = { speakers: 0, themes: 0, fewShot: 0 };

  const rawThemes = Array.isArray(parsed.dominant_themes) ? parsed.dominant_themes : [];
  const themes: ThemeInsight[] = [];
  for (const t of rawThemes) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const theme = typeof o.theme === 'string' ? o.theme.trim() : '';
    const gloss = typeof o.gloss === 'string' ? o.gloss.trim() : '';
    const quote = typeof o.evidence_quote === 'string' ? o.evidence_quote.trim() : '';
    if (!theme || !quote) {
      dropped.themes++;
      continue;
    }
    // Quote must be traceable: at least one long word from it appears in the corpus.
    const traceable = longWords(quote).some((w) => corpusWordSet.has(w));
    if (!traceable) {
      dropped.themes++;
      continue;
    }
    themes.push({ theme, gloss, evidence_quote: quote });
  }

  const rawSpeakers = Array.isArray(parsed.recurrent_speakers) ? parsed.recurrent_speakers : [];
  const speakers: SpeakerInsight[] = [];
  const seenSpeakers = new Set<string>();
  for (const s of rawSpeakers) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const role = typeof o.role === 'string' ? o.role.trim() : '';
    if (!name) {
      dropped.speakers++;
      continue;
    }
    // Anti-hallucination: the name must actually occur in the sampled corpus.
    if (!corpusLower.includes(name.toLowerCase())) {
      dropped.speakers++;
      continue;
    }
    const key = name.toLowerCase();
    if (seenSpeakers.has(key)) continue;
    seenSpeakers.add(key);
    speakers.push({ name, role });
  }

  const tics = (Array.isArray(parsed.stylistic_tics) ? parsed.stylistic_tics : [])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 6);

  const rawFewShot = Array.isArray(parsed.few_shot_examples) ? parsed.few_shot_examples : [];
  const fewShot: FewShotInsight[] = [];
  for (const f of rawFewShot) {
    if (fewShot.length >= MAX_FEW_SHOT) break;
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const input = typeof o.input === 'string' ? o.input.trim() : '';
    const output = typeof o.output === 'string' ? o.output.trim() : '';
    const reasoning = typeof o.reasoning === 'string' ? o.reasoning.trim() : '';
    if (!input || !output) {
      dropped.fewShot++;
      continue;
    }
    // Output must be traceable to the corpus (real post, not synthesized): require
    // a meaningful overlap of long words.
    const overlap = longWords(output).filter((w) => corpusWordSet.has(w)).length;
    if (overlap < 3) {
      dropped.fewShot++;
      continue;
    }
    fewShot.push({ input, output, reasoning });
  }

  return { themes, speakers, tics, fewShot, dropped };
}

/** Assemble the injectable German markdown block from validated insights (length-capped). */
function buildInsightsBlock(month: string, outcome: AnalysisOutcome): string {
  if (outcome.themes.length === 0 && outcome.speakers.length === 0 && outcome.tics.length === 0) {
    return '';
  }
  const parts: string[] = [];
  parts.push(`## AKTUELLE KORPUS-EINBLICKE (automatisch aktualisiert, Stand ${month})`);
  parts.push(
    'Die folgenden Beobachtungen stammen aus einer automatischen Analyse der letzten realen ' +
      'Veröffentlichungen dieses Landesverbands. Sie ergänzen — und überschreiben nicht — deine ' +
      'oben definierte Rolle, Regeln und Struktur.'
  );
  if (outcome.themes.length > 0) {
    parts.push(
      '**Aktuell dominante Themen:**\n' +
        outcome.themes.map((t) => `- ${t.theme}: ${t.gloss}`).join('\n')
    );
  }
  if (outcome.speakers.length > 0) {
    parts.push(
      '**Aktuell aktive Sprecher*innen:**\n' +
        outcome.speakers.map((s) => `- ${s.name}${s.role ? ` (${s.role})` : ''}`).join('\n')
    );
  }
  if (outcome.tics.length > 0) {
    parts.push('**Aktuelle Stil-Beobachtungen:**\n' + outcome.tics.map((t) => `- ${t}`).join('\n'));
  }
  const block = parts.join('\n\n');
  return block.length > INSIGHTS_BLOCK_MAX_CHARS
    ? `${block.slice(0, INSIGHTS_BLOCK_MAX_CHARS).trimEnd()}…`
    : block;
}

async function persist(
  record: Omit<PrAgentInsightRecord, 'computedAt'>,
  month: string
): Promise<void> {
  await db().query(
    `INSERT INTO pr_agent_insight_snapshots
       (agent_identifier, month, insights_block, few_shot_examples, themes, speakers,
        status, source_collection, sample_size, model, computed_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, now())
     ON CONFLICT (agent_identifier, month) DO UPDATE
       SET insights_block = EXCLUDED.insights_block,
           few_shot_examples = EXCLUDED.few_shot_examples,
           themes = EXCLUDED.themes,
           speakers = EXCLUDED.speakers,
           status = EXCLUDED.status,
           source_collection = EXCLUDED.source_collection,
           sample_size = EXCLUDED.sample_size,
           model = EXCLUDED.model,
           computed_at = now()`,
    [
      record.agentIdentifier,
      month,
      record.insightsBlock,
      JSON.stringify(record.fewShotExamples),
      JSON.stringify(record.themes),
      JSON.stringify(record.speakers),
      record.status,
      record.sourceCollection,
      record.sampleSize,
      record.model,
    ]
  );
  invalidateCache(record.agentIdentifier);
}

/**
 * Compute and persist the insight snapshot for a single PR agent.
 * Replaces any existing row for the same (agent_identifier, month).
 */
export async function refreshPrAgentInsight(
  identifier: string,
  month: string = currentMonth()
): Promise<RefreshResult | null> {
  const scope = getPrAgentScopes().find((s) => s.identifier === identifier);
  if (!scope) {
    log.warn(`Unknown PR agent: ${identifier} — skipping`);
    return null;
  }

  const t0 = Date.now();
  const [press, social] = await Promise.all([samplePress(scope), sampleSocial(scope)]);
  const docs = [...press, ...social];
  const sampleSize = docs.length;
  const sourceCollection = `${scope.country === 'AT' ? PRESS_COLLECTION_AT : PRESS_COLLECTION}+${SOCIAL_COLLECTION}`;
  log.info(
    `[${identifier}] sampled ${press.length} press + ${social.length} social = ${sampleSize} docs`
  );

  // Insufficient data → don't ship a thin/false overlay; keep last good month.
  if (sampleSize < MIN_SAMPLE) {
    log.warn(`[${identifier}] sample ${sampleSize} < ${MIN_SAMPLE} — storing rejected snapshot`);
    await persist(
      {
        agentIdentifier: identifier,
        month,
        insightsBlock: '',
        fewShotExamples: [],
        themes: [],
        speakers: [],
        status: 'rejected',
        sourceCollection,
        sampleSize,
        model: null,
      },
      month
    );
    return {
      agentIdentifier: identifier,
      month,
      status: 'rejected',
      sampleSize,
      themeCount: 0,
      speakerCount: 0,
      fewShotCount: 0,
      droppedSpeakers: 0,
      droppedThemes: 0,
      droppedFewShot: 0,
      durationMs: Date.now() - t0,
    };
  }

  const outcome = await analyzeScope(scope, docs);
  const insightsBlock = buildInsightsBlock(month, outcome);

  // Reject when validation left nothing usable — fall back to last active month.
  const usable = outcome.themes.length > 0 || outcome.speakers.length > 0;
  const status: 'active' | 'rejected' = usable && insightsBlock.length > 0 ? 'active' : 'rejected';

  await persist(
    {
      agentIdentifier: identifier,
      month,
      insightsBlock,
      fewShotExamples: outcome.fewShot,
      themes: outcome.themes,
      speakers: outcome.speakers,
      status,
      sourceCollection,
      sampleSize,
      model: ANALYSIS_MODEL,
    },
    month
  );

  const dt = Date.now() - t0;
  log.info(
    `[${identifier}] ${status}: ${outcome.themes.length} themes, ${outcome.speakers.length} speakers, ${outcome.fewShot.length} examples; dropped ${outcome.dropped.themes}t/${outcome.dropped.speakers}s/${outcome.dropped.fewShot}f; sample=${sampleSize}, ${dt}ms`
  );

  return {
    agentIdentifier: identifier,
    month,
    status,
    sampleSize,
    themeCount: outcome.themes.length,
    speakerCount: outcome.speakers.length,
    fewShotCount: outcome.fewShot.length,
    droppedSpeakers: outcome.dropped.speakers,
    droppedThemes: outcome.dropped.themes,
    droppedFewShot: outcome.dropped.fewShot,
    durationMs: dt,
  };
}

/**
 * Compute snapshots for all PR agents sequentially (one large LLM call each).
 * Sequential keeps provider load predictable; per-agent try/catch means one
 * failure never aborts the batch. When `sendDigest` is set (the monthly cron),
 * an admin summary email is sent afterwards — mirroring the content-sync digest.
 */
export async function refreshAllPrAgentInsights(
  month: string = currentMonth(),
  options: { sendDigest?: boolean } = {}
): Promise<RefreshResult[]> {
  const scopes = getPrAgentScopes();
  log.info(
    `Starting monthly PR-agent insight refresh for ${scopes.length} agents (month=${month})`
  );

  const results: RefreshResult[] = [];
  for (const scope of scopes) {
    try {
      const result = await refreshPrAgentInsight(scope.identifier, month);
      if (result) results.push(result);
    } catch (err) {
      const message = toError(err).message;
      log.error(`[${scope.identifier}] insight refresh failed: ${message}`);
      results.push({
        agentIdentifier: scope.identifier,
        month,
        status: 'rejected',
        sampleSize: 0,
        themeCount: 0,
        speakerCount: 0,
        fewShotCount: 0,
        droppedSpeakers: 0,
        droppedThemes: 0,
        droppedFewShot: 0,
        durationMs: 0,
        error: message,
      });
    }
  }

  const active = results.filter((r) => r.status === 'active').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  log.info(
    `Monthly PR-agent insight refresh complete: ${active} active, ${rejected} rejected of ${results.length}`
  );

  if (options.sendDigest) {
    await sendDigest(month, results).catch((err) =>
      log.error(`Digest email failed (non-fatal): ${toError(err).message}`)
    );
  }

  return results;
}

async function sendDigest(month: string, results: RefreshResult[]): Promise<void> {
  const to = env.CONTENT_SYNC_EMAIL;
  if (!to) {
    log.info('Digest skipped: CONTENT_SYNC_EMAIL not set');
    return;
  }
  if (!isEmailConfigured()) {
    log.info('Digest skipped: SMTP not configured');
    return;
  }

  const active = results.filter((r) => r.status === 'active').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const errored = results.filter((r) => r.error).length;
  const icon = errored > 0 || rejected > 0 ? '⚠️' : '✅';

  const rows = results
    .map((r) => {
      const drops = `${r.droppedThemes}t/${r.droppedSpeakers}s/${r.droppedFewShot}f`;
      const note = r.error ? ` — Fehler: ${r.error}` : '';
      return `${r.status === 'active' ? '✅' : '⛔'} ${r.agentIdentifier}: ${r.themeCount} Themen, ${r.speakerCount} Sprecher*innen, ${r.fewShotCount} Beispiele (Sample ${r.sampleSize}, verworfen ${drops})${note}`;
    })
    .join('\n');

  const text = `PR-Agent Insight Refresh — ${month}\n\nGesamt: ${active} aktiv, ${rejected} rejected, ${errored} Fehler (von ${results.length}).\n\n${rows}\n`;
  const htmlRows = results
    .map((r) => {
      const drops = `${r.droppedThemes}t/${r.droppedSpeakers}s/${r.droppedFewShot}f`;
      const note = r.error ? ` — <em>Fehler: ${r.error}</em>` : '';
      return `<tr><td>${r.status === 'active' ? '✅' : '⛔'}</td><td>${r.agentIdentifier}</td><td align="right">${r.themeCount}</td><td align="right">${r.speakerCount}</td><td align="right">${r.fewShotCount}</td><td align="right">${r.sampleSize}</td><td align="right">${drops}</td><td>${note}</td></tr>`;
    })
    .join('');
  const html = `<h2>${icon} PR-Agent Insight Refresh — ${month}</h2>
<p><strong>Gesamt:</strong> ${active} aktiv, ${rejected} rejected, ${errored} Fehler (von ${results.length}).</p>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th></th><th>Agent</th><th>Themen</th><th>Sprecher*innen</th><th>Beispiele</th><th>Sample</th><th>verworfen (t/s/f)</th><th>Notiz</th></tr>
${htmlRows}
</table>`;

  await sendEmail({
    to,
    subject: `${icon} PR-Agent Insights ${month}: ${active} aktiv, ${rejected} rejected`,
    html,
    text,
  });
}

// ─── Runtime read path (used by the ChatGraph respond node) ──────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — snapshots change monthly
const cache = new Map<string, { value: PrAgentInsightRecord | null; expires: number }>();

function invalidateCache(identifier: string): void {
  cache.delete(identifier);
}

function parseThemes(raw: unknown): ThemeInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    if (typeof o.theme !== 'string') return [];
    return [
      {
        theme: o.theme,
        gloss: typeof o.gloss === 'string' ? o.gloss : '',
        evidence_quote: typeof o.evidence_quote === 'string' ? o.evidence_quote : '',
      },
    ];
  });
}

function parseSpeakers(raw: unknown): SpeakerInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    if (typeof o.name !== 'string') return [];
    return [{ name: o.name, role: typeof o.role === 'string' ? o.role : '' }];
  });
}

function parseFewShot(raw: unknown): FewShotInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    if (typeof o.input !== 'string' || typeof o.output !== 'string') return [];
    return [
      {
        input: o.input,
        output: o.output,
        reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
      },
    ];
  });
}

/**
 * Read the most recent ACTIVE snapshot for a PR agent. Single indexed lookup,
 * never calls Qdrant/LLM — safe on the chat hot path. Cached in-process for 1h.
 * Returns null when no active snapshot exists (agent then runs on its pristine
 * systemRole — no overlay).
 */
export async function getLatestPrAgentInsight(
  identifier: string
): Promise<PrAgentInsightRecord | null> {
  const cached = cache.get(identifier);
  if (cached && cached.expires > Date.now()) return cached.value;

  const rows = await db().query(
    `SELECT agent_identifier, month, insights_block, few_shot_examples, themes, speakers,
            status, source_collection, sample_size, model, computed_at
       FROM pr_agent_insight_snapshots
      WHERE agent_identifier = $1 AND status = 'active'
      ORDER BY month DESC
      LIMIT 1`,
    [identifier]
  );

  let value: PrAgentInsightRecord | null = null;
  if (rows.length > 0) {
    const r = rows[0] as Record<string, unknown>;
    value = {
      agentIdentifier: r.agent_identifier as string,
      month: r.month as string,
      insightsBlock: (r.insights_block as string) ?? '',
      fewShotExamples: parseFewShot(r.few_shot_examples),
      themes: parseThemes(r.themes),
      speakers: parseSpeakers(r.speakers),
      status: r.status as 'active' | 'rejected',
      sourceCollection: (r.source_collection as string | null) ?? null,
      sampleSize: (r.sample_size as number) ?? 0,
      model: (r.model as string | null) ?? null,
      computedAt:
        r.computed_at instanceof Date ? r.computed_at.toISOString() : String(r.computed_at),
    };
  }

  cache.set(identifier, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Build the injectable system-prompt fragment for a PR agent, or '' when there's
 * no active overlay / the agent isn't a PR agent / the kill-switch is set.
 * Combines the validated insights block with the refreshed few-shot examples.
 */
export async function getPrAgentInsightFragment(identifier: string): Promise<string> {
  if (env.PR_AGENT_INSIGHTS_DISABLED) return '';
  if (!identifier.startsWith(PR_AGENT_PREFIX)) return '';

  let record: PrAgentInsightRecord | null;
  try {
    record = await getLatestPrAgentInsight(identifier);
  } catch (err) {
    log.warn(`[${identifier}] insight fragment read failed: ${toError(err).message}`);
    return '';
  }
  if (!record || !record.insightsBlock) return '';

  let fragment = `\n\n${record.insightsBlock}`;
  if (record.fewShotExamples.length > 0) {
    const examples = record.fewShotExamples
      .map((f, i) => `Beispiel ${i + 1} — Anlass: ${f.input}\n${f.output}`)
      .join('\n\n');
    fragment += `\n\n**Aktuelle Beispiel-Veröffentlichungen (echte, jüngste Posts als Stilreferenz):**\n\n${examples}`;
  }
  return fragment;
}

// ─── Audit export (committed to git via the monthly workflow's PR) ───────────

export interface PrAgentInsightExportFile {
  /** Repo-relative path the workflow writes this artifact to. */
  path: string;
  /** Full human-readable markdown rendering of the snapshot. */
  content: string;
}

function renderSnapshotMarkdown(r: PrAgentInsightRecord): string {
  const lines: string[] = [];
  lines.push(`# Korpus-Einblicke: ${r.agentIdentifier}`);
  lines.push('');
  lines.push(
    `> Automatisch generiert · Monat **${r.month}** · Status **${r.status}** · ` +
      `Modell ${r.model ?? '—'} · Sample ${r.sampleSize} · Quelle ${r.sourceCollection ?? '—'} · ` +
      `Stand ${r.computedAt}`
  );
  lines.push('');
  lines.push(
    '_Dieses Dokument ist ein automatisch erzeugtes Audit-Artefakt. Der Live-Agent zieht denselben ' +
      'Inhalt aus der Datenbank (kein Merge nötig). Es dient der Transparenz und der Drift-Historie._'
  );
  lines.push('');

  if (r.status !== 'active') {
    lines.push(
      `⚠️ Dieser Monat wurde als \`${r.status}\` verworfen (z.B. zu kleines Sample oder ` +
        'Validierung). Der Live-Agent nutzt den letzten gültigen Monat oder kein Overlay.'
    );
    lines.push('');
  }

  lines.push('## Injizierter Block');
  lines.push('');
  lines.push(r.insightsBlock || '_(leer)_');
  lines.push('');

  if (r.themes.length > 0) {
    lines.push('## Themen (mit Beleg-Zitat)');
    lines.push('');
    for (const t of r.themes) {
      lines.push(`- **${t.theme}** — ${t.gloss}`);
      if (t.evidence_quote) lines.push(`  > ${t.evidence_quote}`);
    }
    lines.push('');
  }

  if (r.speakers.length > 0) {
    lines.push('## Sprecher*innen');
    lines.push('');
    for (const s of r.speakers) lines.push(`- ${s.name}${s.role ? ` (${s.role})` : ''}`);
    lines.push('');
  }

  if (r.fewShotExamples.length > 0) {
    lines.push('## Beispiel-Veröffentlichungen (echte, jüngste Posts)');
    lines.push('');
    r.fewShotExamples.forEach((f, i) => {
      lines.push(`### Beispiel ${i + 1} — ${f.input}`);
      lines.push('');
      lines.push(f.output);
      if (f.reasoning) {
        lines.push('');
        lines.push(`_${f.reasoning}_`);
      }
      lines.push('');
    });
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Render every PR agent's snapshot for a month as committable markdown audit
 * files. Used by the monthly workflow to open an `automated` PR alongside the
 * live (DB-driven) overlay — a human-readable, version-controlled trail of how
 * each agent's voice drifts month over month. Reads only the DB; no LLM/Qdrant.
 */
export async function exportPrAgentInsightsForMonth(
  month: string = currentMonth()
): Promise<PrAgentInsightExportFile[]> {
  const rows = await db().query(
    `SELECT agent_identifier, month, insights_block, few_shot_examples, themes, speakers,
            status, source_collection, sample_size, model, computed_at
       FROM pr_agent_insight_snapshots
      WHERE month = $1
      ORDER BY agent_identifier`,
    [month]
  );

  return (rows as Array<Record<string, unknown>>).map((r) => {
    const record: PrAgentInsightRecord = {
      agentIdentifier: r.agent_identifier as string,
      month: r.month as string,
      insightsBlock: (r.insights_block as string) ?? '',
      fewShotExamples: parseFewShot(r.few_shot_examples),
      themes: parseThemes(r.themes),
      speakers: parseSpeakers(r.speakers),
      status: r.status as 'active' | 'rejected',
      sourceCollection: (r.source_collection as string | null) ?? null,
      sampleSize: (r.sample_size as number) ?? 0,
      model: (r.model as string | null) ?? null,
      computedAt:
        r.computed_at instanceof Date ? r.computed_at.toISOString() : String(r.computed_at),
    };
    return {
      // Tracked, build-inert location (apps/api/data/ is gitignored). Owned by
      // this service; the monthly workflow commits these via an automated PR.
      path: `apps/api/agent-insights/${record.agentIdentifier}.md`,
      content: renderSnapshotMarkdown(record),
    };
  });
}
