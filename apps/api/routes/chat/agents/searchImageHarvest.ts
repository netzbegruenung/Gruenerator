/**
 * Image hits on the loop path: taking them out of the tool result and keeping
 * them out of the model's answer.
 *
 * `web_search` has been able to ask Linkup for images (`bilder: true`) all along,
 * and `executeDirectWebSearch` returns them in `images`. But the loop's source
 * decorator replaces every search result with the lean `{ resultCount, sources }`
 * shape, so the images were dropped one hop after we paid for them — the model
 * never saw them, the client never saw them, and the tool description's promise
 * ("er bekommt sie als Links") was false on the only live path.
 *
 * This module is the half that survives that reshaping: harvest the images
 * BEFORE the lean shape is built, accumulate them on the turn, and hand the
 * caller a note for the model. The images themselves travel to the client as
 * their own SSE event — never through the answer text.
 *
 * Two rules the shape of this module encodes:
 *
 *  - The model gets a COUNT, never the URLs. It cannot see an image, so a URL in
 *    its context buys nothing and invites it to paste a hotlink into the prose,
 *    which would put the third-party request back into the reader's browser —
 *    the exact thing the image proxy exists to prevent.
 *  - The note says the images are research material. A web image is not licensed
 *    for us to use, and the answer must not imply otherwise.
 */

import { type WebImageResult } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Per-turn ceiling across ALL searches in the loop.
 *
 * Matches `MAX_IMAGE_HITS` in `directSearchExecutors`, which caps a SINGLE
 * search. Without a turn-level cap too, a loop that searches four times could
 * carry 32 thumbnails into one answer — every one of them a proxied request our
 * backend serves.
 */
export const MAX_TURN_IMAGES = 8;

interface HarvestResult {
  /** The accumulated list for the turn, capped and deduped. Same array identity
   *  as `collected` when nothing was added, so the caller can skip the emit. */
  images: WebImageResult[];
  /** How many entries this tool result contributed. 0 → nothing to send. */
  added: number;
}

/**
 * Read `images` off a tool result and merge it into the turn's list.
 *
 * Validates structurally rather than trusting the executor's declared type: this
 * runs on `unknown` coming back through the AI-SDK tool boundary, where a shape
 * change upstream would otherwise surface as a thumbnail with `undefined` in its
 * `src`. Entries without a usable URL are dropped — a link is the only thing we
 * do with one.
 *
 * Dedup is by URL and keeps the FIRST occurrence: search results arrive
 * relevance-ordered, and the earlier search in a loop is the one whose query the
 * planner wrote closest to the user's ask.
 */
export function harvestSearchImages(result: unknown, collected: WebImageResult[]): HarvestResult {
  if (!result || typeof result !== 'object') return { images: collected, added: 0 };
  const raw = (result as { images?: unknown }).images;
  if (!Array.isArray(raw)) return { images: collected, added: 0 };

  const seen = new Set(collected.map((image) => image.url));
  const images = [...collected];
  let added = 0;

  for (const entry of raw) {
    if (images.length >= MAX_TURN_IMAGES) break;
    if (!entry || typeof entry !== 'object') continue;
    const { url, title, domain } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || url.trim().length === 0) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const host = typeof domain === 'string' ? domain : '';
    images.push({
      url,
      title: typeof title === 'string' && title.length > 0 ? title : host || 'Bild',
      domain: host,
    });
    added += 1;
  }

  return added > 0 ? { images, added } : { images: collected, added: 0 };
}

/**
 * What the writing model is told about the images.
 *
 * A count and a licence constraint, no URLs and no titles. It reaches the model
 * twice by two different routes, because the two loop modes read different
 * things: in `unified` the model sees the tool results, in `split` the synth sees
 * only the source block. Same sentence either way, so the two cannot drift.
 *
 * Mentioning them is CONDITIONAL, and that condition is the whole point of the
 * sentence. An earlier version said "erwähne sie in einem kurzen Satz" flat out.
 * That was written while images only arrived when someone asked for them — once
 * every web search brought them along, the same sentence turned into an order to
 * announce a gallery in every research answer ever written.
 *
 * So the note now has two jobs, and only one of them is unconditional: the model
 * may never claim the images are ours to use, and it should only talk about them
 * when the user asked to see pictures.
 */
export function imageDeliveryNote(count: number): string {
  if (count <= 0) return '';
  return (
    `${count} Bildtreffer aus der Websuche werden dem Benutzer ÜBER deiner Antwort angezeigt. ` +
    `Erwähne sie NUR, wenn er nach Bildern oder Fotos gefragt hat — sonst schreibe deine Antwort, ` +
    `als wären sie nicht da. Verlinke sie NICHT und beschreibe sie NICHT, du siehst sie nicht. ` +
    `Es ist Recherchematerial: Die Rechte liegen bei den Urheber*innen, behaupte nie, die Bilder seien frei nutzbar, ` +
    `und verwende sie nicht für Sharepics oder Social-Posts.`
  );
}
