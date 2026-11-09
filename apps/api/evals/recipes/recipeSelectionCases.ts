/**
 * Fälle der Live-Eval „Rezeptauswahl“ (Plan „Rezepte als Skills“, Task A0).
 * 24 Fälle in vier festen Gruppen; je Fall laufen N Läufe (Standard 3).
 *
 * `expect.anyOf`: je innere Liste müssen ALLE Mentions geladen sein, eine
 * erfüllte Liste genügt. `expect.none`: es darf kein Rezept geladen sein.
 * Mentions sind F1 (Registry-IDs) — LV-Varianten (`presse-berlin-partei` …)
 * stehen nicht drin, weil sie vom Konto der Testperson abhängen.
 */
export interface RecipeSelectionCase {
  id: string;
  prompt: string;
  body?: { activeSkillMention?: string };
  expect: { anyOf?: string[][]; none?: true };
  group: 'wortliste' | 'katalog' | 'negativ' | 'kombi';
}

export const RECIPE_SELECTION_CASES: RecipeSelectionCase[] = [
  // ── wortliste: heute über den Matcher (Plattformwort im Text) ──
  {
    id: 'wl-presse-beschluss',
    group: 'wortliste',
    prompt:
      'Schreib eine Pressemitteilung zum Beschluss des Stadtrats, den Radweg an der Hauptstraße auszubauen.',
    expect: { anyOf: [['presse'], ['presse-beschluss']] },
  },
  {
    id: 'wl-instagram',
    group: 'wortliste',
    prompt: 'Schreib einen Insta-Post über unseren Infostand am Samstag zum Thema Wärmewende.',
    expect: { anyOf: [['instagram']] },
  },
  {
    id: 'wl-facebook',
    group: 'wortliste',
    prompt:
      'Schreib einen Facebook-Post zur Einladung zu unserer Bürger*innenversammlung am Donnerstag.',
    expect: { anyOf: [['facebook']] },
  },
  {
    id: 'wl-linkedin',
    group: 'wortliste',
    prompt: 'Schreib einen LinkedIn-Post über unseren Besuch im Handwerksbetrieb mit Solardach.',
    expect: { anyOf: [['linkedin']] },
  },
  {
    id: 'wl-twitter',
    group: 'wortliste',
    prompt: 'Schreib einen Tweet zur Abstimmung über das Deutschlandticket.',
    expect: { anyOf: [['twitter']] },
  },
  {
    id: 'wl-reel',
    group: 'wortliste',
    prompt: 'Schreib ein Reel-Skript über drei Tipps, wie man im Alltag Energie spart.',
    expect: { anyOf: [['reel']] },
  },
  {
    id: 'wl-wahlpruefstein',
    group: 'wortliste',
    prompt:
      'Beantworte diese Wahlprüfsteine eines Mieterbunds: 1. Wie wollt ihr bezahlbaren Wohnraum schaffen? 2. Wie stellt ihr euch zur Mietpreisbremse?',
    expect: { anyOf: [['wahlpruefstein']] },
  },
  {
    id: 'wl-antrag',
    group: 'wortliste',
    prompt: 'Schreib einen Antrag für den Gemeinderat: mehr Fahrradabstellplätze am Bahnhof.',
    expect: { anyOf: [['antrag']] },
  },

  // ── katalog: kein Plattformwort, das Modell wählt aus dem Katalog ──
  {
    id: 'kat-buergermail',
    group: 'katalog',
    prompt:
      'Ein Bürger schreibt: „Warum kürzt ihr die Busverbindung nach Hinterdorf? Das ist eine Frechheit, wir sind abgehängt.“ Schreib eine Antwort an ihn.',
    expect: { anyOf: [['buergermail']] },
  },
  {
    id: 'kat-aktion',
    group: 'katalog',
    prompt:
      'Wir sind ein kleiner Ortsverband mit fast keinem Budget. Hast du Ideen, wie wir im Ort auf das Thema Hitzeschutz aufmerksam machen?',
    expect: { anyOf: [['aktion']] },
  },
  {
    id: 'kat-leitantrag',
    group: 'katalog',
    prompt:
      'Entwirf das Kapitel „Gute Arbeit und soziale Sicherheit“ für unseren Leitantrag zum Parteitag.',
    expect: { anyOf: [['leitantrag']] },
  },
  {
    id: 'kat-sprechzettel',
    group: 'katalog',
    prompt:
      'Ich halte morgen drei Minuten Rede beim Neujahrsempfang des Kreisverbands. Bau mir einen Sprechzettel zum Thema Klimaanpassung.',
    expect: { anyOf: [['sprechzettel']] },
  },
  {
    id: 'kat-rechtsstand',
    group: 'katalog',
    prompt: 'Was gilt beim Mietrecht aktuell, und was wird gerade verhandelt?',
    expect: { anyOf: [['rechtsstand']] },
  },
  {
    id: 'kat-beschlusslage',
    group: 'katalog',
    prompt: 'Was hat unser Parteitag zur Atomkraft beschlossen?',
    expect: { anyOf: [['beschlusslage']] },
  },
  {
    id: 'kat-bundestagsrecherche',
    group: 'katalog',
    prompt:
      'Werte die Bundestag-Drucksachen der letzten Monate zum Thema Pflegereform aus und fass die Positionen der Fraktionen zusammen.',
    expect: { anyOf: [['bundestagsrecherche']] },
  },
  {
    id: 'kat-wahlpruefstein',
    group: 'katalog',
    prompt:
      'Der Landesverband der Sozialverbände hat uns einen Fragenkatalog zur Landtagswahl geschickt, 12 Fragen zu Pflege und Teilhabe. Hilf mir, die Antworten für die Partei zu formulieren.',
    expect: { anyOf: [['wahlpruefstein']] },
  },

  // ── negativ: kein Rezept darf geladen werden ──
  {
    id: 'neg-gruss',
    group: 'negativ',
    prompt: 'Hallo! Wie geht es dir?',
    expect: { none: true },
  },
  {
    id: 'neg-zusammenfassen',
    group: 'negativ',
    prompt:
      'Fass diesen Text zusammen: „Die Stadt plant, bis 2030 alle Straßenlaternen auf LED umzustellen. Das spart rund 40 Prozent Strom. Die Kosten von 2,1 Millionen Euro sollen sich in sieben Jahren amortisieren.“',
    expect: { none: true },
  },
  {
    id: 'neg-uebersetzen',
    group: 'negativ',
    prompt:
      'Übersetze ins Englische: „Wir setzen uns für sauberen Nahverkehr in unserer Stadt ein.“',
    expect: { none: true },
  },
  {
    id: 'neg-faktenfrage',
    group: 'negativ',
    prompt: 'Wie hoch ist der CO₂-Preis 2026?',
    expect: { none: true },
  },

  // ── kombi: mehrere Rezepte in einem Turn ──
  {
    id: 'kombi-insta-facebook',
    group: 'kombi',
    prompt:
      'Schreib mir einen Insta-Post und einen Facebook-Post zum selben Thema: unser neues Repair-Café im Gemeindehaus.',
    expect: { anyOf: [['instagram', 'facebook']] },
  },
  {
    id: 'kombi-presse-beschlusslage',
    group: 'kombi',
    prompt:
      'Schreib eine Pressemitteilung zum Thema Windkraft, aber ausschließlich auf Grundlage unserer Beschlusslage, nichts anderes.',
    expect: { anyOf: [['presse-beschluss'], ['presse', 'beschlusslage']] },
  },
  {
    id: 'kombi-presse-bundestag',
    group: 'kombi',
    prompt:
      '@presse Recherchiere vorher im Bundestag, was die Fraktionen zum Heizungsgesetz vorgelegt haben, und schreib dann die Pressemitteilung.',
    body: { activeSkillMention: 'presse' },
    expect: { anyOf: [['presse', 'bundestagsrecherche']] },
  },
  {
    id: 'kombi-buergermail-aktion',
    group: 'kombi',
    prompt:
      '@buergermail Antworte auf die Mail im Anhang und schlag am Ende eine passende Aktionsidee vor.\n\nAnhang (Mail): „Sehr geehrte Damen und Herren, in unserer Straße fehlt seit Jahren ein Zebrastreifen vor der Grundschule. Was tun Sie dagegen?“',
    body: { activeSkillMention: 'buergermail' },
    expect: { anyOf: [['buergermail', 'aktion']] },
  },
];
