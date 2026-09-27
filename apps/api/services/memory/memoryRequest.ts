/**
 * Does this message ask the assistant to remember, change or forget something?
 *
 * Three readers, one predicate: the loop gate (a memory request must reach the
 * loop, because only the loop has the `memory` tool), the first-call pin (the
 * small planner models skip a mounted tool in a measurable share of turns, and
 * an unmade save that the answer confirms is the exact failure this rebuild
 * exists for) and the single-pass honesty note (a kill-switch can still route
 * the turn past the tool; the answer must then say so instead of confirming).
 *
 * Write and forget requests only. Reading ("was weißt du über mich?") needs no
 * tool — the prompt block already carries every instruction and the matching
 * facts. Correction wording ("nein, kürzer") is deliberately absent: a
 * correction of THIS text is not a memory (decision 2026-09-01); only the
 * generalised forms ("ab jetzt immer", "generell") are.
 *
 * The newer forms are held on a short leash because the same words are
 * politics: "von nun an"/"beim nächsten Mal" only with "bitte" or "immer",
 * "bitte immer/nie" only opening a sentence, and "nie wieder …" only with a
 * closing "bitte" or a writing-style word — "Nie wieder Krieg" is a slogan,
 * not a rule, and no style word is one.
 *
 * Lookarounds instead of `\b`: `\b` is ASCII-only and dies next to umlauts.
 */
const MEMORY_REQUEST_RE =
  /(?<![\p{L}\d_])(?:merk(?:e|st)?\s+(?:es\s+|das\s+|dir\s+das\s+)?dir|(?:dir|das)\s+(?:bitte\s+)?merken|notier(?:e)?\s+dir|speicher(?:e)?\s+(?:dir|das\s+als\s+erinnerung)|denk(?:e)?\s+(?:bitte\s+)?daran|vergiss(?:t)?(?=\s)|erinner(?:e)?\s+dich|ab\s+(?:jetzt|sofort|heute)\s+(?:immer|nie|niemals|bitte|nur|keine?)|(?:von\s+nun\s+an|beim\s+nächsten\s+mal|nächstes\s+mal)\s+(?:bitte|immer)|(?:künftig|zukünftig|in\s+zukunft|generell|grundsätzlich)\s+(?:immer|nie|niemals|nur|bitte|keine?)|(?<=^\s*|[.!?]\s+)bitte\s+(?:immer|nie|niemals)|nie\s+wieder\s+(?:[^.!?]{1,40}?[\s,]bitte(?=\s*(?:[.!]|$))|(?:gender(?:n|sternchen|stern|doppelpunkt|zeichen)|emojis?|ausrufezeichen|hashtags?|anglizismen|smileys?|fettdruck|aufzählungen|duzen|siezen|du-form|sie-form)))(?![\p{L}\d_])/iu;

export function looksLikeMemoryRequest(text: string): boolean {
  return MEMORY_REQUEST_RE.test(text ?? '');
}
