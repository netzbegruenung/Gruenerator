/**
 * Quick-prompt rotating suggestions for the AI section.
 *
 * Each canvas type has a curated pool of German prompt phrases. We pick a
 * random subset (default 4) at module load time so each editor session
 * shows a different rotation — keeps the UI feeling fresh and exposes the
 * breadth of AI capabilities without overwhelming.
 *
 * All prompts follow project rules: du-form, Genderstern proactive
 * (`Bürger*innen`, `Wähler*innen`), kampagnentauglich.
 */

const SHARED_PROMPTS = [
  'Mach den Text schlagkräftiger.',
  'Formuliere konkreter mit einer Zahl oder einem Beispiel.',
  'Stärker auf die Zielgruppe zugeschnitten.',
  'Reduziere auf eine zentrale Aussage.',
  'Mehr Aufruf zum Handeln.',
  'Genderstern hinzufügen, falls noch nicht da.',
  'Klimagerechtes Framing einbauen.',
  'Hoffnungsvoller, lösungsorientierter Ton.',
];

const PROMPTS_BY_TEMPLATE: Record<string, string[]> = {
  simple: [
    ...SHARED_PROMPTS,
    'Mach die Headline kürzer und prägnanter.',
    'Untertext informativer ohne länger zu werden.',
  ],
  info: [
    ...SHARED_PROMPTS,
    'Mache die Überschrift einprägsamer.',
    'Fasse den Text auf das Wesentliche zusammen.',
    'Wechsle zur Tanne-Hintergrundfarbe für mehr Kontrast.',
  ],
  zitat: [
    ...SHARED_PROMPTS,
    'Verkürze das Zitat auf seine Kernaussage.',
    'Formuliere das Zitat alltagsnäher.',
  ],
  'zitat-pure': [
    ...SHARED_PROMPTS,
    'Verkürze das Zitat auf seine Kernaussage.',
    'Wechsle zur grünen Hintergrundfarbe.',
  ],
  dreizeilen: [
    'Mach die drei Zeilen rhythmischer.',
    'Eine zentrale Forderung pro Zeile.',
    'Wechsle zum Tanne-Sand-Farbschema.',
    'Genderstern in alle Zeilen einbauen.',
    'Zeile 3 zur Aufforderung umformulieren.',
    'Hoffnungsvoller, lösungsorientierter Ton.',
    'Konkretere Wortwahl mit Zahlen.',
    'Sonnenblume ein- oder ausblenden.',
  ],
  veranstaltung: [
    ...SHARED_PROMPTS,
    'Veranstaltungstitel einladender formulieren.',
    'Beschreibung kürzer und präziser.',
  ],
  freeform: [
    ...SHARED_PROMPTS,
    'Füge eine passende Illustration hinzu.',
    'Hintergrundfarbe an das Thema anpassen.',
  ],
  slider: [
    ...SHARED_PROMPTS,
    'Headline auf eine zentrale Frage zuspitzen.',
    'Wechsle zum sand-tanne Farbschema.',
    'Untertext informativer formulieren.',
  ],
};

const FALLBACK_POOL = SHARED_PROMPTS;

/**
 * Pick a random subset of quick prompts for a canvas template.
 * Stable per call — wrap in useState to keep it stable across renders.
 */
export function pickQuickPrompts(canvasType: string, count = 4): string[] {
  const pool = PROMPTS_BY_TEMPLATE[canvasType] ?? FALLBACK_POOL;
  if (pool.length <= count) return [...pool];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
