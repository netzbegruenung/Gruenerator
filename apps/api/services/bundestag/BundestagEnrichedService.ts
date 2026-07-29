/**
 * BundestagEnrichedService
 *
 * Orchestrates the Bundestag MCP client into a single compact result for
 * chat. Three deterministic resolution paths, checked in order of precision:
 *   - document: an explicit Drucksache number ("Drucksache 21/123", "Drs.
 *     20/1234", bare "21/123") → the document + its legislative process
 *   - person:   a named MP → profile + recent activities + topical speeches
 *   - topic:    default → semantic DIP hits + matching plenary speeches
 *
 * Name extraction reuses the (pure-regex, no-network) patterns from
 * PersonDetectionService; everything the service returns is pre-trimmed by
 * the client wrappers, so no raw DIP shapes reach the LLM. A single failing
 * MCP call degrades to an empty list — this service never throws.
 */
import {
  getBundestagMCPClient,
  CURRENT_WAHLPERIODE,
  SUBSTANTIVE_ENTITY_TYPES,
  type BundestagMCPClient,
} from './BundestagMCPClient.js';
import { getPersonDetectionService } from './PersonDetectionService.js';

import type {
  BtDrucksache,
  BtEnrichedResult,
  BtSemanticHit,
  BtSpeech,
  BtVorgang,
} from './types.js';

// Explicit reference: "Drucksache 21/123", "BT-Drs. 20/1234", "Drs 21/50".
const EXPLICIT_DRS_RE = /\b(?:drucksache|bt-?drs\.?|drs\.?)\s*(\d{1,2})\s*\/\s*(\d{1,6})\b/i;
// Bare "21/123" only when the numerator is a plausible recent Wahlperiode —
// keeps dates ("31/12") and fractions ("3/4") from triggering the document path.
const BARE_DRS_RE = /\b(1[6-9]|2[0-1])\/(\d{1,5})\b/;

// Queries that ask for spoken words get more speech results.
const SPEECH_QUERY_RE = /\brede|redet|debatt|plenar|gesagt|gesprochen|geäußert|wortlaut/i;

// Recency questions ("worüber hat X zuletzt gesprochen", "neueste Anträge")
// must order by date, not by semantic score — the MCP exposes sort:"newest".
const RECENCY_QUERY_RE =
  /\b(zuletzt|neueste[nrs]?|neuste[nrs]?|aktuelle[nrs]?|jüngste[nrs]?|kürzlich|letzte[nrs]?|zurzeit|derzeit|momentan)\b/i;

// Words that carry no topic signal — stripped before deriving a speech query.
const TOPIC_STOPWORDS = new Set([
  'wie',
  'hat',
  'haben',
  'wer',
  'was',
  'welche',
  'welcher',
  'welchen',
  'ist',
  'war',
  'sind',
  'wurde',
  'zu',
  'zur',
  'zum',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'und',
  'oder',
  'im',
  'in',
  'am',
  'für',
  'gegen',
  'von',
  'beim',
  'auf',
  'aus',
  'über',
  'rede',
  'reden',
  'gehalten',
  'gesagt',
  'debatte',
  'debattiert',
  'plenum',
  'drucksache',
  'dokument',
  'antrag',
  'anfrage',
  'gesetzentwurf',
  'abgeordnete',
  'abgeordneter',
  'abgeordneten',
  'mdb',
  'bundestag',
  'fraktion',
  'partei',
  'politik',
  'thema',
]);

// Capitalized words that pair up into parliamentary compounds rather than
// names — guards the two-adjacent-capitals heuristic in `findNameCandidate`.
const NON_NAME_TOKENS = new Set([
  'bundestag',
  'bundesrat',
  'bundesregierung',
  'bundeskanzler',
  'bundeskanzlerin',
  'bundesminister',
  'bundesministerin',
  'deutscher',
  'deutsche',
  'deutschen',
  'kleine',
  'große',
  'anfrage',
  'anfragen',
  'antrag',
  'anträge',
  'drucksache',
  'drucksachen',
  'gesetzentwurf',
  'gesetz',
  'reden',
  'rede',
  'debatte',
  'debatten',
  'plenarprotokoll',
  'fraktion',
  'ausschuss',
  'grüne',
  'grünen',
  'linke',
  'union',
  'natürlicher',
  'wahlperiode',
]);

export class BundestagEnrichedService {
  private detection = getPersonDetectionService();
  private client: BundestagMCPClient = getBundestagMCPClient();

  async search(query: string): Promise<BtEnrichedResult> {
    const startTime = Date.now();
    const notes: string[] = [];
    const sort = RECENCY_QUERY_RE.test(query) ? ('newest' as const) : undefined;
    const candidate = this.detection.extractNameFromQuery(query);
    // The regex extractor over-triggers on topic questions ("Was wurde im…" →
    // "Was wurde im"). Only accept extractions that plausibly ARE a German
    // name, otherwise topic queries detour through a pointless person lookup
    // and its "not found" note pollutes the LLM context.
    const patternName = candidate && this.looksLikePersonName(candidate) ? candidate : null;
    // …but those patterns are a closed list of verb phrasings plus a hardcoded
    // set of known Green MPs, so "Worüber hat Katrin Uhlig zuletzt gesprochen?"
    // and "Welche Reden hat Friedrich Merz gehalten?" fell straight through to
    // the topic path. DIP resolves any MP by surname, so let the name candidate
    // be generous and let the MCP be the arbiter — an unresolvable candidate
    // falls through to the topic path exactly as before.
    const extractedName = patternName ?? this.findNameCandidate(query);
    const drsMatch = query.match(EXPLICIT_DRS_RE) ?? query.match(BARE_DRS_RE);
    const dokumentnummer = drsMatch ? `${Number(drsMatch[1])}/${Number(drsMatch[2])}` : null;
    const meta = () => ({
      query,
      extractedName: extractedName ?? null,
      matchedDokumentnummer: dokumentnummer,
      fetchTimeMs: Date.now() - startTime,
    });

    // ── Document path — an explicit Drucksache number is the strongest signal
    if (dokumentnummer) {
      const { items: docs } = await this.client.findDrucksache({ dokumentnummer, limit: 5 });
      const drucksache = docs[0];
      if (drucksache) {
        const { items: vorgaenge } = drucksache.titel
          ? await this.client.searchVorgaenge({
              query: drucksache.titel,
              ...(drucksache.wahlperiode != null ? { wahlperiode: drucksache.wahlperiode } : {}),
              limit: 1,
            })
          : { items: [] };
        if (docs.length > 1) {
          notes.push(`${docs.length - 1} weitere Dokumente zur Nummer ${dokumentnummer}.`);
        }
        return {
          kind: 'document',
          document: { drucksache, siblings: docs.slice(1, 3), vorgang: vorgaenge[0] ?? null },
          notes,
          metadata: meta(),
        };
      }
      notes.push(`Drucksache ${dokumentnummer} wurde im DIP nicht gefunden.`);
      // fall through to person/topic so the query still gets answered
    }

    // ── Person path ──────────────────────────────────────────────────────────
    if (extractedName) {
      const { items: persons } = await this.client.searchPersonenTrimmed(extractedName, 5);
      const person = persons[0];
      if (person) {
        const topic = this.extractTopic(query, extractedName);
        // "worüber hat X zuletzt gesprochen" carries no topic once the name and
        // stopwords are stripped — with no usable topic, ordering by date is the
        // only thing that answers the question, so ask for more and newest-first.
        const speechSort = sort ?? (topic ? undefined : 'newest');
        const [aktResult, speechResult] = await Promise.all([
          this.client.searchAktivitaetenTrimmed(person.id, 8),
          this.client.searchSpeeches({
            query: topic ?? person.name,
            speaker: person.name,
            limit: speechSort === 'newest' ? 5 : 3,
            ...(speechSort ? { sort: speechSort } : {}),
          }),
        ]);
        if (persons.length > 1) {
          notes.push(`${persons.length - 1} weitere Namenstreffer (z. B. ${persons[1].name}).`);
        }
        this.noteWpFallback(notes, speechResult.wpFallback || aktResult.wpFallback);
        return {
          kind: 'person',
          person: { person, aktivitaeten: aktResult.items, speeches: speechResult.items },
          notes,
          metadata: meta(),
        };
      }
      notes.push(`Keine:n Abgeordnete:n zu „${extractedName}" im DIP gefunden.`);
    }

    // ── Topic path (default) ─────────────────────────────────────────────────
    const speechLimit = SPEECH_QUERY_RE.test(query) ? 4 : 2;
    const [hitResult, speechResult] = await Promise.all([
      // Overfetch: `entityTypes` still lets a bill's Bundestag and Bundesrat
      // versions through under one title, and dedupeHits drops the redundant
      // one — asking for 6 would then deliver fewer than 6.
      this.client.semanticSearch({
        query,
        limit: 10,
        entityTypes: SUBSTANTIVE_ENTITY_TYPES,
        ...(sort ? { sort } : {}),
      }),
      this.client.searchSpeeches({ query, limit: speechLimit, ...(sort ? { sort } : {}) }),
    ]);
    const hits = this.dedupeHits(hitResult.items).slice(0, 6);

    // The semantic layer can be empty or unavailable (vector backend down) —
    // fall back to the raw DIP title search so topic queries still resolve.
    let documents: BtDrucksache[] = [];
    let vorgaenge: BtVorgang[] = [];
    if (hits.length === 0 && speechResult.items.length === 0) {
      const keyword = this.extractTopic(query) ?? query;
      const [drsResult, vorgangResult] = await Promise.all([
        this.client.findDrucksache({ query: keyword, limit: 4 }),
        this.client.searchVorgaenge({ query: keyword, limit: 3 }),
      ]);
      documents = drsResult.items;
      vorgaenge = vorgangResult.items;
      if (documents.length > 0 || vorgaenge.length > 0) {
        notes.push(
          'Die semantische Suche lieferte keine Treffer — die Ergebnisse stammen aus der DIP-Titelsuche.'
        );
        this.noteWpFallback(notes, drsResult.wpFallback || vorgangResult.wpFallback);
      }
    }

    if (
      hits.length > 0 ||
      speechResult.items.length > 0 ||
      documents.length > 0 ||
      vorgaenge.length > 0
    ) {
      this.noteWpFallback(notes, hitResult.wpFallback || speechResult.wpFallback);
      return {
        kind: 'topic',
        topic: {
          hits,
          speeches: this.dedupeSpeeches(speechResult.items),
          documents,
          vorgaenge,
        },
        notes,
        metadata: meta(),
      };
    }

    return { kind: 'none', notes, metadata: meta() };
  }

  private noteWpFallback(notes: string[], fellBack: boolean): void {
    if (fellBack) {
      notes.push(
        `In der aktuellen Wahlperiode gab es keine Treffer — die Ergebnisse stammen aus früheren Wahlperioden.`
      );
    }
  }

  /**
   * Two adjacent capitalized tokens read as a person name in German. Every noun
   * is capitalized, so a single capitalized word carries no signal — but two in
   * a row almost always means "Vorname Nachname". The exceptions are compound
   * parliamentary terms ("Kleine Anfrage", "Deutscher Bundestag"), so both
   * tokens are checked against a stoplist; the sentence-initial token is skipped
   * because German capitalizes it regardless.
   */
  private findNameCandidate(query: string): string | null {
    const tokens = query
      .replace(/[^\p{L}\s-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (let i = 1; i < tokens.length - 1; i += 1) {
      const first = tokens[i];
      const second = tokens[i + 1];
      if (!/^\p{Lu}/u.test(first) || !/^\p{Lu}/u.test(second)) continue;
      if (NON_NAME_TOKENS.has(first.toLowerCase()) || NON_NAME_TOKENS.has(second.toLowerCase())) {
        continue;
      }
      return `${first} ${second}`;
    }
    return null;
  }

  /** German names are capitalized and don't start with a question word. */
  private looksLikePersonName(name: string): boolean {
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 4) return false;
    if (/^(was|wie|wer|wo|wann|warum|wieso|welche[rns]?)$/i.test(tokens[0])) return false;
    return tokens.every((t) => /^\p{Lu}/u.test(t));
  }

  /** Derive a compact topic string from the query (name + stopwords removed). */
  private extractTopic(query: string, name?: string): string | null {
    const nameTokens = new Set((name ?? '').toLowerCase().split(/\s+/).filter(Boolean));
    const words = query
      .toLowerCase()
      .replace(/[^\p{L}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !TOPIC_STOPWORDS.has(w) && !nameTokens.has(w));
    if (words.length === 0) return null;
    return words.slice(0, 4).join(' ');
  }

  /** The vector index can return several chunks of one speech — keep the best. */
  private dedupeSpeeches(speeches: BtSpeech[]): BtSpeech[] {
    const seen = new Set<string>();
    const out: BtSpeech[] = [];
    for (const s of speeches) {
      const key = `${s.speaker}:${s.protokollNummer ?? s.date ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  /**
   * One bill reaches DIP as several records under the SAME title — the
   * Bundestag Drucksache and its Bundesrat counterpart, plus reprints. They are
   * indistinguishable to the reranker (identical title, null abstract), so they
   * crowd out other topics for no informational gain.
   *
   * Keep one record per title, preferring the Bundestag document: its
   * `dokumentnummer` is `<wahlperiode>/<laufende Nummer>` ("21/6587"), whereas
   * the Bundesrat numbers by year ("382/25"). Hits arrive relevance-ordered, so
   * the first of a group is otherwise the one to keep.
   */
  private dedupeHits(hits: BtSemanticHit[]): BtSemanticHit[] {
    const isBundestag = (h: BtSemanticHit): boolean =>
      (h.dokumentnummer ?? '').startsWith(`${CURRENT_WAHLPERIODE}/`);
    const byTitle = new Map<string, BtSemanticHit>();
    const order: string[] = [];
    for (const h of hits) {
      const key = h.title.toLowerCase().replace(/\s+/g, ' ').trim();
      const kept = byTitle.get(key);
      if (!kept) {
        byTitle.set(key, h);
        order.push(key);
        continue;
      }
      if (!isBundestag(kept) && isBundestag(h)) byTitle.set(key, h);
    }
    return order.flatMap((k) => {
      const h = byTitle.get(k);
      return h ? [h] : [];
    });
  }
}

let instance: BundestagEnrichedService | null = null;

export function getBundestagEnrichedService(): BundestagEnrichedService {
  if (!instance) instance = new BundestagEnrichedService();
  return instance;
}
