/**
 * Die Zeile unter einem Treffer der manuellen Recherche — eine Stelle, drei
 * Oberflächen (Web-Karte, Notizbuch-Karte auf Mobile, Recherche-Tab).
 */

/**
 * Wie oft der Suchbegriff im Dokument vorkommt, als Untergrenze beschriftet.
 *
 * `term_chunk_count` zählt über die abgerufenen Chunks, und das Recall-Fenster
 * schneidet vorher ab. Gemessen am 26.08.2026 über 38 Trefferdokumente traf die
 * Zahl in 65,8 % der Fälle die echte Zahl im Dokument, lag in 34,2 % darunter
 * und **nie** darüber (`pnpm --filter @gruenerator/api eval:manual:mentions`).
 * Eine Untergrenze darf man deshalb behaupten, eine Gesamtzahl nicht.
 *
 * Ohne wörtlichen Treffer — rein semantisch gefunden — bleibt es bei den
 * Abschnitten, denn dann gibt es keine Erwähnung zu zählen.
 */
export function formatResearchHitCount(
  termChunkCount: number | null | undefined,
  chunkCount: number | null | undefined
): string {
  const mentions = termChunkCount ?? 0;
  if (mentions > 0) {
    return mentions === 1 ? 'mind. 1 Erwähnung' : `mind. ${mentions} Erwähnungen`;
  }

  const chunks = chunkCount ?? 0;
  return chunks === 1 ? '1 Textabschnitt' : `${chunks} Textabschnitte`;
}
