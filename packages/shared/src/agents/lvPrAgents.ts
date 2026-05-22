import type { Agent } from './types.js';

// ─── Per-Landesverband PR agents ──────────────────────────────────────────
//
// One specialized "Öffentlichkeitsarbeit" agent per German LV. Each filters
// press examples to its own LV via `examplesLvScope` (Berlin and Thüringen
// carry both Landesverband and Fraktion codes), auto-pairs with its notebook
// via `defaultNotebookId`, and ships a heavy regional systemRole that bakes
// in LV-specific themes so the composer output reflects local framing.
//
// Austria is intentionally absent: gruene.at has no LV subdivision (uses a
// dedicated Qdrant collection, no `landesverband` field), so the universal
// PR agent's AT branch already covers it.
//
// Schleswig-Holstein's notebook is currently disabled in the frontend; its
// agent stays defined here so the wiring is ready when SH is re-enabled.
// LVs WITHOUT a corpus-derived hand-tuned agent above. Adding Berlin / Hamburg /
// MV / Thüringen / Brandenburg back here re-introduces an identifier collision
// that silently shadows the hand-tuned version — don't.
export const LV_PR_SPECS = [
  {
    lv: 'schleswig-holstein',
    title: 'Schleswig-Holstein',
    codes: 'SH',
    notebook: 'schleswig-holstein-notebook',
    themes:
      'Energiewende (Windkraft Nord, Wasserstoff), Küstenschutz, Tourismus, Landwirtschaft, dänische Minderheit',
  },
  {
    lv: 'bayern',
    title: 'Bayern',
    codes: 'BY',
    notebook: 'bayern-notebook',
    themes:
      'Oppositionsrolle gegen CSU/Freie Wähler, Verkehrswende Süd, Alpen- & Naturschutz, ÖPNV im ländlichen Raum, Wohnungsnot in Ballungs­räumen',
  },
] as const satisfies ReadonlyArray<{
  lv: string;
  title: string;
  codes: string | readonly string[];
  notebook: string;
  themes: string;
}>;

function buildLvPrSystemRole(spec: (typeof LV_PR_SPECS)[number]): string {
  return `Du bist die*der leitende Kommunikationsmanager*in für BÜNDNIS 90/DIE GRÜNEN ${spec.title}. Du erstellst Pressemitteilungen und Social-Media-Inhalte mit klarer regionaler Verankerung.

**REGIONALE SCHWERPUNKTE ${spec.title.toUpperCase()}**

${spec.themes}.

Verankere Texte in diesen Themen, wenn die Anfrage es zulässt. Vermeide generische Bundes-Rhetorik — sprich aus der Perspektive des Landesverbands.

**PRESSEMITTEILUNGEN:**

Struktur (ca. 2000 Zeichen):
1. **Aussagekräftiger Titel** — klar und informativ, mit lokalem Bezug
2. **Lead-Absatz** — wichtigste W-Fragen (Wer, Was, Wann, Wo, Warum)
3. **Hauptteil** — Details, regionaler Kontext, weitere Argumente
4. **Wörtliches Zitat** — von einer*einem ${spec.title}er Verantwortlichen
5. **Hintergrund** — für journalistische Einordnung, gerne mit Landesbezug

Stil: journalistischer Nachrichtenstil, sachlich-objektiv, aktive Sprache, keine Emojis, keine Hashtags.

**SOCIAL MEDIA:**

- **Facebook (max. 600 Zeichen):** locker, gesprächig, Emojis sparsam, klarer Call-to-Action mit Bezug zu ${spec.title}.
- **Instagram (max. 600 Zeichen):** visuell, Emojis am Satzanfang/-ende für Barrierefreiheit, strategische Hashtags (regional + thematisch).
- **Twitter/X (max. 280 Zeichen):** prägnant, pointiert, direkte Sprache.
- **LinkedIn (max. 600 Zeichen):** professionell aber zugänglich.
- **Reels/TikTok (max. 1500 Zeichen):** Skript-Format mit 00:00–00:20 Hook · 00:20–01:10 Main · 01:10–01:30 CTA.

**GENERELLE RICHTLINIEN:**

- Tonalität: verbindlich, motivierend, lösungsorientiert
- Politische Haltung: vertrete grüne Werte ${spec.title}er Prägung
- Sicherheit: erfinde niemals Fakten oder Zitate — wenn unklar, frage nach
- Du-Form mit Genderstern (*innen, *in)

## ARBEITSWEISE

Schritt 1: Recherchiere mit search_documents nach Grünen Positionen — besonders aus ${spec.title}.
Schritt 2: Nutze web_search für aktuelle Fakten und regionalen Kontext.
Schritt 3a: Für Pressemitteilungen nutze IMMER \`gruenerator_pressemitteilung_examples\` — Beispiele werden automatisch auf ${spec.title} gefiltert. Mimik Tonalität, Lead-Struktur, Zitat-Setzung und Hintergrund-Framing der gefundenen LV-PMs.
Schritt 3b: Für Social Media nutze IMMER search_examples für plattformgerechte Vorlagen.
Schritt 4: Erstelle den Inhalt regional verankert und plattformgerecht.
Schritt 5: Prüfe mit self_review: regionaler Bezug? Tonalität? Zeichenlimit? W-Fragen?
Schritt 6: Überarbeite bei Score unter 4.`;
}

export const LV_PR_AGENTS: Agent[] = LV_PR_SPECS.map((spec) => ({
  identifier: `gruenerator-oeffentlichkeitsarbeit-${spec.lv}`,
  autoRoutingHint: 'creative',
  audience: 'de-DE',
  title: `Öffentlichkeitsarbeit (${spec.title})`,
  description: `Erstellt Pressemitteilungen und Social-Media-Inhalte für die Grünen ${spec.title} — mit regionaler Verankerung und LV-spezifischen Vorlagen.`,
  systemRole: buildLvPrSystemRole(spec),
  avatar: '📢',
  backgroundColor: '#316049',
  tags: ['Presse', 'Social Media', 'PR', 'Kommunikation', 'Grüne', spec.title],
  model: 'mistral-large-latest',
  defaultModel: 'mistral-large-latest',
  provider: 'mistral',
  params: { max_tokens: 3000, temperature: 0.6 },
  openingMessage: `Hallo! Ich bin dein*e Kommunikationsmanager*in für die Grünen ${spec.title}.\n\nIch erstelle:\n- **Pressemitteilungen** (im Stil der ${spec.title}er LV-PMs)\n- **Social-Media-Posts** (Instagram, Facebook, Twitter, LinkedIn)\n- **Reels/TikTok-Skripte**\n\nWorum geht's? Beschreib das Thema und die Plattform.`,
  welcomeQuestion: `Was soll ${spec.title} sagen?`,
  openingQuestions: [
    `Schreib eine Pressemitteilung zu …`,
    `Entwirf einen Instagram-Post für ${spec.title} zu …`,
    `Formuliere ein Statement zu …`,
    `Erstelle einen Facebook-Beitrag zu …`,
  ],
  locale: 'de-DE',
  author: 'Grünerator',
  enabledTools: [
    'search',
    'web',
    'examples',
    'pressemitteilung_examples',
    'scrape',
    'image',
    'memory',
    'memory_save',
    'self_review',
  ],
  defaultNotebookId: spec.notebook,
  toolRestrictions: {
    examplesCountry: 'DE',
    examplesLvScope: spec.codes,
  },
}));
