/**
 * EnrichedPoliticianService
 *
 * Orchestrates the Abgeordnetenwatch client into a single compact result for
 * chat. Two resolution paths:
 *   - person: a named MP → profile + current mandate + recent votes + side-jobs
 *     (+ exact votes on polls matching a topic keyword in the query)
 *   - poll:   a roll-call question → best-matching poll + aggregated tally
 *
 * Name extraction reuses the (pure-regex, no-network) patterns from the
 * Bundestag PersonDetectionService; resolution itself goes through the
 * Abgeordnetenwatch API, which covers all parties (not just GRÜNE).
 */
import { createLogger } from '../../utils/logger.js';
import { getAbgeordnetenwatchClient } from '../api-clients/abgeordnetenwatchApiClient.js';
import { getPersonDetectionService } from '../bundestag/PersonDetectionService.js';

import { type AwEnrichedResult, type AwVote } from './types.js';

const log = createLogger('abgeordnetenwatch-service');

const POLL_QUERY_RE =
  /abstimmung|abgestimmt|namentliche|gestimmt|votum|mehrheit|beschlossen|ergebnis/i;

// Words that carry no topic signal — stripped before deriving a poll keyword.
const TOPIC_STOPWORDS = new Set([
  'wie',
  'hat',
  'haben',
  'wer',
  'ist',
  'war',
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
  'ging',
  'aus',
  'wurde',
  'gestimmt',
  'abgestimmt',
  'abstimmung',
  'namentliche',
  'nebentätigkeit',
  'nebentätigkeiten',
  'nebeneinkünfte',
  'abgeordnete',
  'abgeordneter',
  'abgeordneten',
  'mdb',
  'bundestag',
  'fraktion',
  'partei',
  'politik',
  'ergebnis',
  'mehrheit',
]);

export class EnrichedPoliticianService {
  private detection = getPersonDetectionService();

  async search(query: string): Promise<AwEnrichedResult> {
    const startTime = Date.now();
    const notes: string[] = [];
    const extractedName = this.detection.extractNameFromQuery(query);
    const meta = () => ({
      query,
      extractedName: extractedName ?? null,
      fetchTimeMs: Date.now() - startTime,
    });

    let client: Awaited<ReturnType<typeof getAbgeordnetenwatchClient>>;
    try {
      client = await getAbgeordnetenwatchClient();
    } catch (error: unknown) {
      log.warn(
        `[abgeordnetenwatch] client init failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { kind: 'none', notes, metadata: meta() };
    }

    // ── Person path ─────────────────────────────────────────────────────────
    if (extractedName) {
      const candidates = await client.searchPoliticians(extractedName, 5);
      const politician = candidates[0];
      if (politician) {
        const mandate = await client.getCurrentMandate(politician.id);
        let recentVotes: AwVote[] = [];
        let topicVotes: AwVote[] = [];
        let sideJobs = [] as Awaited<ReturnType<typeof client.getSideJobs>>;

        if (mandate) {
          const topic = this.extractTopic(query, extractedName);
          const [rv, sj, tv] = await Promise.all([
            client.getVotes({ mandateId: mandate.mandateId, limit: 15 }),
            client.getSideJobs(mandate.mandateId, 10),
            topic ? this.fetchTopicVotes(client, mandate.mandateId, topic) : Promise.resolve([]),
          ]);
          recentVotes = rv;
          sideJobs = sj;
          topicVotes = tv;
        } else {
          notes.push(
            `Kein aktuelles Mandat für ${politician.name} gefunden — evtl. nicht (mehr) im Parlament.`
          );
        }
        if (candidates.length > 1) {
          notes.push(
            `${candidates.length - 1} weitere Namenstreffer (z. B. ${candidates[1].name}).`
          );
        }
        return {
          kind: 'person',
          person: { politician, mandate, recentVotes, topicVotes, sideJobs },
          notes,
          metadata: meta(),
        };
      }
      notes.push(`Keine:n Abgeordnete:n zu „${extractedName}" gefunden.`);
    }

    // ── Poll path ───────────────────────────────────────────────────────────
    if (POLL_QUERY_RE.test(query)) {
      const keyword = this.extractTopic(query, extractedName ?? undefined);
      if (keyword) {
        const polls = await client.searchPolls({ keyword, limit: 8 });
        if (polls.length > 0) {
          const tally = await client.getPollTally(polls[0].pollId);
          if (polls.length > 1)
            notes.push(`${polls.length - 1} weitere passende Abstimmungen gefunden.`);
          return {
            kind: 'poll',
            ...(tally ? { tally } : {}),
            relatedPolls: polls,
            notes,
            metadata: meta(),
          };
        }
        notes.push(`Keine namentliche Abstimmung zu „${keyword}" gefunden.`);
      }
    }

    return { kind: 'none', notes, metadata: meta() };
  }

  /** Derive a compact topic keyword from the query (name + stopwords removed). */
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

  /** Exact votes on the top polls matching a topic keyword (≤3 polls). */
  private async fetchTopicVotes(
    client: Awaited<ReturnType<typeof getAbgeordnetenwatchClient>>,
    mandateId: number,
    topic: string
  ): Promise<AwVote[]> {
    const polls = await client.searchPolls({ keyword: topic, limit: 3 });
    if (polls.length === 0) return [];
    const perPoll = await Promise.all(
      polls.map((p) => client.getVotes({ mandateId, pollId: p.pollId, limit: 1 }))
    );
    return perPoll.flat();
  }
}

let instance: EnrichedPoliticianService | null = null;

export function getEnrichedPoliticianService(): EnrichedPoliticianService {
  if (!instance) instance = new EnrichedPoliticianService();
  return instance;
}
