/**
 * The chat thread title budget — one number for every writer.
 *
 * Measured, not guessed: the sidebar row leaves the title ~188px (260px panel
 * − 16px `px-2` − 24px `px-3` − 8px gap − 24px more-button), and PT Sans at
 * 14px fits ~26–28 German characters in that (~20 in the 220px desktop-app
 * panel). 32 is that plus a little slack — the row truncates whatever overflows.
 *
 * It lives here because three writers share it and used to disagree: the AI
 * prompt and the heuristic fallback on the server (`threadTitleService.ts`) and
 * the optimistic title the client shows while the server's is in flight
 * (`GrueneratorThreadListAdapter.ts`). See #3400 and #3411.
 */
export const MAX_THREAD_TITLE_CHARS = 32;

/**
 * German function words — never a title on their own, never the last word.
 *
 * Contractions are listed next to the preposition they contract ("bei"/"beim",
 * "in"/"ins"): a title can end on either form, and half a pair would strip
 * "… Vorgaben in" but leave "… Vorgaben ins".
 */
const FUNCTION_WORDS =
  'der|die|das|den|dem|des|ein|eine|einen|einem|eines|einer|und|oder|als|' +
  'für|fürs|von|vom|mit|in|im|ins|an|am|ans|auf|aufs|zu|zum|zur|bei|beim|' +
  'über|übers|unter|unters|aus|nach|vor|vors|durch|durchs|um|ums';
/**
 * A run of them left standing at the end. Cutting on a word boundary strands
 * articles and prepositions ("… Budget und Standortfragen" → "… Budget und");
 * the `+` takes the whole run, so "Suche nach dem Windkraft-Beschluss" ends at
 * "Suche" rather than at "Suche nach".
 */
const DANGLING_WORDS = new RegExp(`(?:\\s+(?:${FUNCTION_WORDS}))+$`, 'i');
const ONLY_A_FUNCTION_WORD = new RegExp(`^(?:${FUNCTION_WORDS})$`, 'i');

/**
 * Cut a title to the budget at a word boundary, never mid-word.
 *
 * No ellipsis: every surface that shows a thread title adds its own — CSS
 * `text-overflow` on web and in the desktop app, `numberOfLines` on native —
 * so an appended `...` either sits past that cut or doubles it.
 */
export function clampThreadTitle(text: string, max: number = MAX_THREAD_TITLE_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  // A single word longer than the budget is the only case we cut mid-word.
  const cut = (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:–-]+$/, '');
  const trimmed = cut.replace(DANGLING_WORDS, '');
  // An article in front of one long compound ("Die Verwaltungsvorschriften-
  // änderung") has its only word boundary after the article, so a clean cut
  // leaves a bare "Die". A mid-word cut the row can ellipsize beats that.
  if (ONLY_A_FUNCTION_WORD.test(trimmed)) return head.replace(/[\s,;:–-]+$/, '');
  return trimmed;
}
