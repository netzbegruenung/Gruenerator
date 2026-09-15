/**
 * Die Zeichenzahlen, an denen der Upload-Pfad seine Chunks schneidet — eigene
 * Datei, damit sie ohne die Einbettungs-Kette importierbar bleiben.
 *
 * Sie stehen hier, weil zwei weitere Zahlen von ihnen abhängen: die
 * Ausschnittsgrenze der Suche (`CONTENT_MAX_EXCERPT_LENGTH`) und das Fenster,
 * das der Antwort-Prompt je Quelle durchlässt. Liegt eine davon unter der
 * Chunk-Größe, bekommt das Modell einen Bruchteil genau der Einheit zurück, die
 * wir eingebettet, gesucht und bewertet haben — und niemand sieht es, weil jede
 * Zahl für sich plausibel aussieht. Genau so war es bis zum 24.08.2026 (400
 * Token indexiert gegen 300 Zeichen ausgeschnitten, also gut ein Fünftel) und
 * noch einmal bis zum 02.09.2026 (Tabellen-Chunks bis 2400 Zeichen gegen ein
 * Prompt-Fenster von 1800). Der Wächter dazu steht in
 * `apps/api/config/searchExcerptBudget.vitest.ts`.
 */

/**
 * Obergrenze eines Fließtext-Chunks (`sentenceRepack`, `chunkPostProcessing.ts`,
 * `targetChars`).
 */
export const PROSE_CHUNK_MAX_CHARS = 1600;

/**
 * Was der Antwort-Prompt je Quelle durchlässt (`sourceTextForPrompt`,
 * `services/search/SearchResultProcessor.ts`) — und zugleich der Deckel für
 * einen Tabellen-Chunk (`TABLE_CHUNK_MAX_CHARS`, `blockSegmentation.ts`). Wer
 * die Zahl senkt, schneidet Tabellen im Prompt wieder mitten in einer Zeile ab.
 */
export const PROMPT_SOURCE_MAX_CHARS = 1800;
