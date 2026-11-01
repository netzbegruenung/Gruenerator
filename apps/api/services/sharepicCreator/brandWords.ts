/**
 * Whose design a sharepic request asks for, in the person's own words.
 *
 * Only callers that already know the turn orders a sharepic ask this — the
 * chat's sharepic generation and the creator route. A name alone („die Grüne
 * Jugend hat heute …“ in a document request) never reaches here, so it never
 * switches a design.
 */
import { type SharepicBrand } from '@gruenerator/contracts';

/** „Grüne Jugend“, „GRÜNEN JUGEND“, „Grüne-Jugend-Design“ — the organisation's name in any case. */
const GJ_NAME = /(?<!\p{L})gr(?:ü|ue)ne[nr]?[\s-]+jugend(?!\p{L})/iu;
/** „GJ-Design“, „GJ Design“, „GJ-Look“ — the short form only together with design words. */
const GJ_SHORT = /(?<!\p{L})gj[\s-]*(?:design|look|stil|cd)(?!\p{L})/iu;

export function namesGjDesign(text: string): boolean {
  return GJ_NAME.test(text) || GJ_SHORT.test(text);
}

/** The brand a fresh sharepic request names; null keeps the party's. */
export function requestedBrand(text: string): SharepicBrand | null {
  return namesGjDesign(text) ? 'gruene-jugend' : null;
}
