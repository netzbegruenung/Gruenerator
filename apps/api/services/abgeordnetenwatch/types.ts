/**
 * Types for the Abgeordnetenwatch enrichment service — the compact, LLM-safe
 * result assembled from the trimmed client DTOs.
 */
import {
  type AwPolitician,
  type AwMandate,
  type AwVote,
  type AwSideJob,
  type AwPollSummary,
  type AwPollTally,
} from '../api-clients/schemas/abgeordnetenwatch.js';

export type {
  AwPolitician,
  AwMandate,
  AwVote,
  AwSideJob,
  AwPollSummary,
  AwPollTally,
} from '../api-clients/schemas/abgeordnetenwatch.js';

export interface AwPersonResult {
  politician: AwPolitician;
  mandate: AwMandate | null;
  recentVotes: AwVote[];
  /** Votes on polls that matched a topic keyword in the query (exact answers). */
  topicVotes: AwVote[];
  sideJobs: AwSideJob[];
}

/**
 * Discriminated on `kind`:
 *  - 'person' → a specific MP was resolved (profile + votes + side-jobs)
 *  - 'poll'   → a roll-call was asked about (tally + related polls)
 *  - 'none'   → nothing resolvable; caller falls back to a graceful message
 */
export interface AwEnrichedResult {
  kind: 'person' | 'poll' | 'none';
  person?: AwPersonResult;
  tally?: AwPollTally;
  relatedPolls?: AwPollSummary[];
  /** Human-readable "+N weitere" / truncation disclosures (no silent caps). */
  notes: string[];
  metadata: {
    query: string;
    extractedName: string | null;
    fetchTimeMs: number;
  };
}
