import { splitThemes } from './landesverbaende.js';

import type { Agent } from './types.js';

// ─── Per-Landesverband PR agents ──────────────────────────────────────────
//
// One specialized "Öffentlichkeitsarbeit" agent per German LV. Each filters
// press examples to its own LV via `examplesLvScope` (Berlin and Thüringen
// carry both Landesverband and Fraktion codes) and auto-pairs with its notebook
// via `defaultNotebookIds`. The systemRole ships empty: the short persona lives
// in the private repo (`<INTERN_CONTENT_DIR>/agents/<identifier>.md`, filled in
// by agentLoader), the craft rules in the recipe named by `defaultRecipeMention`.
//
// Austria is intentionally absent: gruene.at has no LV subdivision (uses a
// dedicated Qdrant collection, no `landesverband` field), so the universal
// PR agent's AT branch already covers it.
//
// Schleswig-Holstein's notebook is currently disabled in the frontend; its
// agent stays defined here so the wiring is ready when SH is re-enabled.
// LVs WITHOUT a corpus-derived hand-tuned agent above. Adding Berlin / Hamburg /
// MV / Thüringen / Brandenburg / Bayern back here re-introduces an identifier
// collision that silently shadows the hand-tuned version — don't.
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
    lv: 'saarland',
    title: 'Saarland',
    codes: 'SL',
    notebook: 'saarland-notebook',
    themes:
      'Strukturwandel und Industrie (Stahl, Automobil), Energiewende, Mobilität und ÖPNV (Saarbahn), Bildung, Gesundheit und Krankenhäuser, Grenzregion zu Frankreich',
  },
] as const satisfies ReadonlyArray<{
  lv: string;
  title: string;
  codes: string | readonly string[];
  notebook: string;
  themes: string;
}>;

// Concrete, LV-specific example prompts for the welcome screen — derived from
// the spec's own `themes` so every LV gets tailored Beispiel-Karten.
function buildLvPrOpeningQuestions(spec: (typeof LV_PR_SPECS)[number]): string[] {
  const topics = splitThemes(spec.themes);
  const [t0, t1, t2] = [topics[0], topics[1] ?? topics[0], topics[2] ?? topics[0]];
  return [
    `Schreib eine Pressemitteilung zu ${t0}`,
    `Entwirf einen Instagram-Post für ${spec.title} zu ${t1}`,
    `Formuliere ein Statement zu ${t2}`,
    'Erstelle einen Facebook-Beitrag zu …',
  ];
}

export const LV_PR_AGENTS: Agent[] = LV_PR_SPECS.map((spec) => ({
  identifier: `gruenerator-oeffentlichkeitsarbeit-${spec.lv}`,
  autoRoutingHint: 'creative',
  audience: 'de-DE',
  title: `Öffentlichkeitsarbeit (${spec.title})`,
  description: `Erstellt Pressemitteilungen und Social-Media-Inhalte für die Grünen ${spec.title} — mit regionaler Verankerung und LV-spezifischen Vorlagen.`,
  systemRole: '',
  defaultRecipeMention: 'presse',
  avatar: '📢',
  backgroundColor: '#316049',
  tags: ['Presse', 'Social Media', 'PR', 'Kommunikation', 'Grüne', spec.title],
  model: 'mistral-large-latest',
  defaultModel: 'mistral-large-latest',
  provider: 'mistral',
  params: { max_tokens: 8000, temperature: 0.6 },
  openingMessage: `Hallo! Ich bin dein*e Kommunikationsmanager*in für die Grünen ${spec.title}.\n\nIch erstelle:\n- **Pressemitteilungen** (im Stil der ${spec.title}er LV-PMs)\n- **Social-Media-Posts** (Instagram, Facebook, Twitter, LinkedIn)\n- **Reels/TikTok-Skripte**\n\nWorum geht's? Beschreib das Thema und die Plattform.`,
  welcomeQuestion: `Was soll ${spec.title} sagen?`,
  openingQuestions: buildLvPrOpeningQuestions(spec),
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
  defaultNotebookIds: [spec.notebook],
  toolRestrictions: {
    examplesCountry: 'DE',
    examplesLvScope: spec.codes,
  },
}));
