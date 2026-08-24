/**
 * Die Chunk-Größe des aktiven Upload-Pfads — eigene Datei, damit sie ohne die
 * Einbettungs-Kette importierbar bleibt.
 *
 * Sie steht hier, weil eine zweite Zahl von ihr abhängt: die Ausschnittsgrenze
 * der Suche (`CONTENT_MAX_EXCERPT_LENGTH`). Liegt die darunter, bekommt das
 * Modell einen Bruchteil genau der Einheit zurück, die wir eingebettet, gesucht
 * und bewertet haben — und niemand sieht es, weil beide Zahlen für sich
 * plausibel aussehen. Genau so war es bis zum 24.08.2026: 400 Token gegen 300
 * Zeichen, also gut ein Fünftel. Der Wächter dazu steht in
 * `apps/api/config/searchExcerptBudget.vitest.ts`.
 */
export const DOCUMENT_CHUNK_MAX_TOKENS = 400;

/**
 * Zeichen je Token für deutschen Fließtext — die Umrechnung, die die beiden
 * Zahlen überhaupt vergleichbar macht. Konservativ gewählt: gemessen an einem
 * 8-Seiten-PDF (21 118 Zeichen auf 16 Chunks = 1320 im Schnitt) liegt der
 * tatsächliche Wert bei rund 3,3.
 */
export const CHARS_PER_TOKEN_DE = 3.3;
