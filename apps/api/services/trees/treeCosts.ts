/**
 * What a metered action costs in "Bäume", in one place.
 *
 * Pure arithmetic, no I/O: the same table prices an image before the provider
 * is called, a Voice request before and after synthesis, and a DeepL job the
 * frontend only estimates — so a preview and the actual booking can never
 * disagree.
 *
 * Accounting happens in hundredths of a Baum ("units"), because Redis `INCRBY`
 * takes integers and half an image (0,5) and a DeepL document (2,5 Bäume) must
 * survive the round trip exactly. Only the display layer divides by 100 again.
 *
 * The rates are today's four separate daily limits expressed in one currency,
 * so nobody's allowance changes on the day this replaces them.
 */

export const UNITS_PER_TREE = 100;
/** The product decision behind everything else: what one account gets per day. */
export const BASE_DAILY_TREES = 10;
export const NEWSLETTER_BONUS_TREES = 5;
export const SPEECH_SECONDS_PER_TREE = 180;
export const CHARS_PER_TREE = 20_000;

/** DeepL bills docx/pptx/xlsx/pdf at least this much per file. */
export const DOCUMENT_MIN_CHARS = 50_000;

export const TREE_COST_DEEP_RESEARCH = 100;
export const TREE_COST_DOCUMENT = 250;

/** The multiplier is the model's relative price (0,5 / 1 / 2), not a count. */
export function treeCostForImage(costMultiplier: number): number {
  return Math.round(costMultiplier * UNITS_PER_TREE);
}

export function treeCostForSpeechSeconds(seconds: number): number {
  return Math.ceil((Math.max(0, seconds) * UNITS_PER_TREE) / SPEECH_SECONDS_PER_TREE);
}

export function treeCostForChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / (CHARS_PER_TREE / UNITS_PER_TREE));
}

export function unitsToTrees(units: number): number {
  return Math.round(units) / UNITS_PER_TREE;
}

const treeFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function formatTrees(units: number): string {
  return treeFormat.format(unitsToTrees(units));
}
