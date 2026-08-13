/**
 * Was ein abgebrochener Zug dem Nutzer schuldet — für BEIDE Antwortpfade.
 *
 * Stand bis 13.08.2026 nur im agentischen Loop. Der Single-Pass hatte gar keine
 * Antwort auf die Frage: lief seine Turn-Uhr mitten in der Antwort ab, sah das
 * für ihn aus wie ein sauberes Ende (das AI SDK schickt bei Abbruch einen
 * `abort`-Part und schliesst den Stream), und der abgeschnittene Text wurde als
 * fertiger Zug gespeichert — ohne Fehler, ohne Marker, nach Reload nicht mehr
 * von einer vollständigen Antwort zu unterscheiden.
 *
 * Eigenes Modul und kein Import aus `agenticLoop/agenticRespondService`, weil
 * der in die Gegenrichtung importiert (`resolveModel` aus
 * responseStreamingService) — ein Zyklus wäre der Preis für die geteilte Zeile.
 */

/**
 * Appended when the stream was torn down after the answer had already started.
 *
 * Leads with a blank line so it separates from whatever half-sentence it lands
 * behind, and names the cause in the user's terms — "abgebrochen", not
 * "AbortError". It ships as a `text_delta` AND into the persisted text, so a
 * reloaded thread carries the same warning the live turn showed.
 */
export const TRUNCATION_NOTE =
  '\n\n_Hier musste ich abbrechen — die Antwort ist unvollständig. Frag gern nach dem fehlenden Teil._';

/** What a failed turn owes the user, given what it had already written. */
export interface AbortOutcome {
  /** Text to send as a delta. */
  delta: string;
  /** `replace`: nothing was written, `delta` IS the answer (and any recorded
   *  textOffset now points into text that no longer exists).
   *  `append`: a half answer stands and only gets the honest footnote. */
  mode: 'replace' | 'append';
}

/**
 * The four ways a turn can end badly — one function, because the
 * interesting case used to have no branch at all.
 *
 * Before, only the empty-text cases were handled; a turn that died with an
 * answer half-written fell through in silence and shipped the stump. The
 * asymmetry is deliberate the other way round now: an ABORT with text means the
 * stream was torn down mid-sentence, so the user must be told. A genuine ERROR
 * with text is different — the answer had already streamed to completion and
 * something afterwards (an artifact hook, a persistence step) threw. Marking
 * that one "unvollständig" would be a lie, so it stays silent.
 */
export function resolveAbortOutcome(params: {
  text: string;
  aborted: boolean;
}): AbortOutcome | null {
  if (params.text.trim().length === 0) {
    if (params.aborted) {
      return {
        delta:
          'Das hat leider zu lange gedauert. Magst du es noch einmal versuchen oder die Frage eingrenzen?',
        mode: 'replace',
      };
    }
    return {
      delta: 'Bei der Antwort ist etwas schiefgelaufen. Versuch es bitte gleich noch einmal.',
      mode: 'replace',
    };
  }
  return params.aborted ? { delta: TRUNCATION_NOTE, mode: 'append' } : null;
}
