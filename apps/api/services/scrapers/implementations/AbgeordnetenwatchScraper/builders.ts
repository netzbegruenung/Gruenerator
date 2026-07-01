/**
 * Document builders for the Abgeordnetenwatch scraper.
 *
 * Pure functions that turn a raw API entity into the `{ text, payload }` pair
 * that gets embedded + upserted into `abgeordnetenwatch_documents`. Kept free of
 * I/O so they're trivially testable. Two content types share the collection,
 * discriminated by `payload.content_type`:
 *   - 'abstimmung'      — one namentliche Abstimmung (poll) + the Grünen stance
 *   - 'nebentaetigkeit' — one Nebentätigkeit (sidejob), joined to its MP
 */

// ── Raw API shapes (only the fields we consume; everything optional) ─────────
export interface RawRef {
  id?: number;
  label?: string;
  abgeordnetenwatch_url?: string;
}
export interface RawPoll {
  id: number;
  label?: string;
  field_intro?: string | null;
  field_poll_date?: string | null;
  field_accepted?: boolean | null;
  field_legislature?: RawRef | null;
  field_topics?: { label?: string }[] | null;
  abgeordnetenwatch_url?: string;
}
export interface RawVote {
  vote?: string;
  fraction?: { label?: string } | null;
}
export interface RawMandate {
  id: number;
  politician?: { label?: string } | null;
  parliament_period?: RawRef | null;
  fraction_membership?:
    | { fraction?: { label?: string } | null; valid_until?: string | null }[]
    | null;
}
export interface RawSidejob {
  id: number;
  label?: string;
  income_level?: string | null;
  interval?: string | null;
  job_title_extra?: string | null;
  data_change_date?: string | null;
  sidejob_organization?: { label?: string } | null;
  field_topics?: { label?: string }[] | null;
  mandates?: { id?: number }[] | null;
}

export interface MandateInfo {
  politician: string | null;
  party: string | null;
  parliament: string | null;
}

export interface BuiltDocument {
  text: string;
  payload: Record<string, unknown>;
}

// Point-id namespaces keep poll ids and sidejob ids from colliding in the shared
// collection (both are small ints in overlapping ranges).
export const POLL_ID_BASE = 1_000_000_000;
export const SIDEJOB_ID_BASE = 2_000_000_000;

const GRUENE_RE = /grüne|bündnis ?90/i;
const VOTE_KEYS = ['yes', 'no', 'abstain', 'no_show'] as const;
export type GrueneCounts = { yes: number; no: number; abstain: number; no_show: number };

export function stripHtml(html: string | null | undefined, max = 1200): string {
  if (!html) return '';
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** "Bundestag 2025 - 2029" → "Bundestag"; "EU-Parlament 2024 - 2029" → "EU-Parlament". */
export function deriveParliament(legislatureLabel: string | null | undefined): string | null {
  if (!legislatureLabel) return null;
  return legislatureLabel.replace(/\s*\d.*$/, '').trim() || null;
}

/** "EVP (EU-Parlament 2024 - 2029)" → "EVP". */
export function deriveParty(fractionLabel: string | null | undefined): string | null {
  if (!fractionLabel) return null;
  return fractionLabel.replace(/\s*\(.*\)\s*$/, '').trim() || null;
}

/** Aggregate a poll's votes into Grünen-fraction counts + a majority direction. */
export function aggregateGrueneStance(votes: RawVote[]): {
  counts: GrueneCounts;
  direction: 'ja' | 'nein' | 'enthaltung' | 'uneinheitlich' | 'keine';
} {
  const counts: GrueneCounts = { yes: 0, no: 0, abstain: 0, no_show: 0 };
  for (const v of votes) {
    if (!GRUENE_RE.test(v.fraction?.label ?? '')) continue;
    const vote = (v.vote ?? '') as (typeof VOTE_KEYS)[number];
    if (VOTE_KEYS.includes(vote)) counts[vote] += 1;
  }
  const cast: [number, 'ja' | 'nein' | 'enthaltung'][] = [
    [counts.yes, 'ja'],
    [counts.no, 'nein'],
    [counts.abstain, 'enthaltung'],
  ];
  const totalCast = counts.yes + counts.no + counts.abstain;
  if (totalCast === 0) return { counts, direction: 'keine' };
  const top = Math.max(counts.yes, counts.no, counts.abstain);
  const leaders = cast.filter(([n]) => n === top);
  return { counts, direction: leaders.length > 1 ? 'uneinheitlich' : leaders[0][1] };
}

const topicLabels = (topics: { label?: string }[] | null | undefined): string[] =>
  (topics ?? []).map((t) => t.label ?? '').filter(Boolean);

// ── Poll → document ──────────────────────────────────────────────────────────
export function buildPollDocument(
  poll: RawPoll,
  stance: ReturnType<typeof aggregateGrueneStance>,
  hash: (s: string) => string
): BuiltDocument {
  const label = poll.label ?? '';
  const topics = topicLabels(poll.field_topics);
  const parliamentPeriod = poll.field_legislature?.label ?? '';
  const parliament = deriveParliament(parliamentPeriod);
  const date = poll.field_poll_date ?? null;
  const result =
    poll.field_accepted == null ? 'offen' : poll.field_accepted ? 'angenommen' : 'abgelehnt';
  const g = stance.counts;
  const grueneLine =
    stance.direction === 'keine'
      ? 'Grüne-Fraktion: keine Stimmen erfasst.'
      : `Grüne-Fraktion: Ja ${g.yes}, Nein ${g.no}, Enthaltung ${g.abstain}, nicht abgestimmt ${g.no_show} → mehrheitlich ${stance.direction}.`;

  const text = [
    label,
    '',
    stripHtml(poll.field_intro),
    '',
    `Ergebnis: ${result}${date ? ` am ${date}` : ''}.`,
    grueneLine,
    `Themen: ${topics.join(', ')}. Parlament: ${parliament ?? '—'}.`,
  ].join('\n');

  const payload: Record<string, unknown> = {
    document_id: `aw_poll_${poll.id}`,
    content_type: 'abstimmung',
    source_url:
      poll.abgeordnetenwatch_url ?? `https://www.abgeordnetenwatch.de/api/v2/polls/${poll.id}`,
    parliament,
    parliament_period: parliamentPeriod,
    primary_category: topics[0] ?? null,
    subcategories: topics,
    published_at: date,
    accepted: poll.field_accepted ?? null,
    gruene_vote: stance.direction,
    title: label,
    chunk_text: text,
    content_hash: hash(text),
    indexed_at: new Date().toISOString(),
    source: 'abgeordnetenwatch',
  };
  return { text, payload };
}

// ── Sidejob → document ───────────────────────────────────────────────────────
export function buildSidejobDocument(
  sidejob: RawSidejob,
  info: MandateInfo | null,
  hash: (s: string) => string
): BuiltDocument {
  const label = sidejob.label ?? '';
  const org = sidejob.sidejob_organization?.label ?? null;
  const topics = topicLabels(sidejob.field_topics);
  const person = info?.politician ?? null;
  const party = info?.party ?? null;
  const parliament = info?.parliament ?? null;
  const incomeLevel = sidejob.income_level
    ? Number.parseInt(sidejob.income_level, 10) || null
    : null;
  const year = sidejob.job_title_extra ?? null;

  const who = [person, [party, parliament].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  const text = [
    `Nebentätigkeit${who ? ` von ${who}` : ''}: ${label}`,
    `Organisation: ${org ?? '—'}. Branche/Themen: ${topics.join(', ') || '—'}. Einkommensstufe: ${incomeLevel ?? '—'}/10${year ? ` (${year})` : ''}.`,
  ].join('\n');

  const payload: Record<string, unknown> = {
    document_id: `aw_sidejob_${sidejob.id}`,
    content_type: 'nebentaetigkeit',
    source_url: `https://www.abgeordnetenwatch.de/api/v2/sidejobs/${sidejob.id}`,
    person,
    party,
    parliament,
    organization: org,
    primary_category: topics[0] ?? null,
    subcategories: topics,
    // Stored as string so the keyword facet matches exact stufe values (1–10).
    income_level: incomeLevel != null ? String(incomeLevel) : null,
    published_at: year ?? sidejob.data_change_date ?? null,
    title: label,
    chunk_text: text,
    content_hash: hash(text),
    indexed_at: new Date().toISOString(),
    source: 'abgeordnetenwatch',
  };
  return { text, payload };
}

/** Pick the current (or most recent) fraction from a mandate's memberships. */
export function mandateToInfo(m: RawMandate): MandateInfo {
  const memberships = m.fraction_membership ?? [];
  const current =
    memberships.find((fm) => fm.valid_until == null) ?? memberships[memberships.length - 1];
  return {
    politician: m.politician?.label ?? null,
    party: deriveParty(current?.fraction?.label),
    parliament: deriveParliament(m.parliament_period?.label),
  };
}
