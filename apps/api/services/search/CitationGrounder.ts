/**
 * Citation Grounding Validation
 *
 * Post-generation check that verifies LLM-generated citations actually
 * match their source content. Uses word overlap scoring (Jaccard on tokens)
 * to detect hallucinated citation numbers.
 *
 * Pure string processing — no LLM calls needed.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('CitationGrounder');

export interface GroundingResult {
  groundedCitations: number[];
  ungroundedCitations: number[];
  confidence: number;
  totalCitations: number;
}

interface SourceContent {
  id: number;
  content: string;
}

/**
 * Extract the sentence surrounding a citation marker [N] in text.
 * Returns ~100 chars of context around the citation.
 */
function extractClaimContext(text: string, citationIndex: number): string | null {
  const marker = `[${citationIndex}]`;
  const pos = text.indexOf(marker);
  if (pos === -1) return null;

  // Find sentence boundaries around the citation
  const beforeText = text.slice(Math.max(0, pos - 150), pos);
  const afterText = text.slice(pos + marker.length, pos + marker.length + 100);

  // Look for sentence start (period, newline, or start of text)
  const sentenceStart = beforeText.lastIndexOf('. ');
  const claim = (sentenceStart >= 0 ? beforeText.slice(sentenceStart + 2) : beforeText) + afterText;

  // Trim to sentence end
  const sentenceEnd = claim.indexOf('. ');
  return sentenceEnd >= 0 ? claim.slice(0, sentenceEnd) : claim;
}

/**
 * Tokenize text into normalized words for overlap comparison.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\wäöüß]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Compute word overlap score between claim and source.
 * Returns a score between 0 and 1.
 */
function wordOverlap(claimTokens: Set<string>, sourceTokens: Set<string>): number {
  if (claimTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of claimTokens) {
    if (sourceTokens.has(token)) overlap++;
  }

  return overlap / claimTokens.size;
}

/**
 * Validate that citations in generated text are grounded in their sources.
 *
 * @param text - Generated text with [N] citation markers
 * @param sources - Source contents indexed by citation ID
 * @param threshold - Minimum word overlap to consider grounded (default: 0.15)
 * @returns Grounding result with lists of grounded and ungrounded citations
 */
export function validateCitations(
  text: string,
  sources: SourceContent[],
  threshold: number = 0.15
): GroundingResult {
  // Find all citation markers in text
  const citationPattern = /\[(\d+)\]/g;
  const foundCitations = new Set<number>();
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    foundCitations.add(parseInt(match[1]));
  }

  if (foundCitations.size === 0) {
    return { groundedCitations: [], ungroundedCitations: [], confidence: 1, totalCitations: 0 };
  }

  // Build source content map
  const sourceMap = new Map(sources.map((s) => [s.id, tokenize(s.content)]));

  const grounded: number[] = [];
  const ungrounded: number[] = [];

  for (const citationId of foundCitations) {
    const sourceTokens = sourceMap.get(citationId);
    if (!sourceTokens) {
      // Citation references a non-existent source
      ungrounded.push(citationId);
      continue;
    }

    const claim = extractClaimContext(text, citationId);
    if (!claim) {
      // Couldn't extract claim context — assume grounded
      grounded.push(citationId);
      continue;
    }

    const claimTokens = tokenize(claim);
    const overlap = wordOverlap(claimTokens, sourceTokens);

    if (overlap >= threshold) {
      grounded.push(citationId);
    } else {
      ungrounded.push(citationId);
      log.debug(`[Ground] Citation [${citationId}] ungrounded (overlap: ${overlap.toFixed(2)}): "${claim.slice(0, 80)}..."`);
    }
  }

  const totalCitations = foundCitations.size;
  const confidence = totalCitations > 0 ? grounded.length / totalCitations : 1;

  log.info(`[Ground] ${grounded.length}/${totalCitations} citations grounded (confidence: ${confidence.toFixed(2)})`);

  return {
    groundedCitations: grounded.sort((a, b) => a - b),
    ungroundedCitations: ungrounded.sort((a, b) => a - b),
    confidence,
    totalCitations,
  };
}

/**
 * Remove ungrounded citation markers from text.
 * Replaces [N] with empty string for ungrounded citations.
 */
export function stripUngroundedCitations(text: string, ungroundedIds: number[]): string {
  let result = text;
  for (const id of ungroundedIds) {
    result = result.replace(new RegExp(`\\s*\\[${id}\\]`, 'g'), '');
  }
  return result;
}
