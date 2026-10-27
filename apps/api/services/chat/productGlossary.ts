/**
 * The Grünerator's own vocabulary — product terms a model cannot know from
 * pre-training ("Panda" is a model tier here, not an antivirus).
 *
 * Measured live on 27.10.2026: with `product_knowledge` and
 * `gruenerator_docs_search` mounted, the loop answered "Was ist Panda?",
 * "Was ist ein Explainable?" and "Gibt es eine App?" from its priors (web
 * search for Panda Security, an invented definition, "keine App") — it never
 * recognised the word as ours, so it never looked anything up. The answers
 * were in the docs all along.
 *
 * Three consumers, one list:
 * - {@link buildGlossaryVocabularyNote}: the term NAMES in the loop prompt, so
 *   the model recognises them and decides itself to look them up.
 * - {@link formatGlossaryDefinitions}: the definitions inside the product
 *   knowledge block (`product_knowledge` tool and the meta-question prompt).
 * - {@link GLOSSARY_TERM_RE}: the classifier's feature-noun gate for the
 *   `hilfe` intent, distinctive terms only — a door into the loop, never a
 *   decision.
 */

import { MODEL_OPTIONS } from '@gruenerator/core';

interface GlossaryEntry {
  readonly id: string;
  /** Shown in the loop's vocabulary line. */
  readonly label: string;
  /**
   * Spellings that name the term. Only distinctive words: everyday words
   * ("klein", "mittel") would turn ordinary questions into product questions.
   */
  readonly terms: RegExp;
  /**
   * The spellings distinctive enough to route a question to `hilfe` — only
   * words nobody uses outside the product (Panda, Explainable, Öko-Modus).
   * `null` for everyday words (App, Konto, Projekt, Rezept, Agent): they still
   * get their definition into the prompt, but must not move „Wie baue ich
   * eine App für Bürgerbeteiligung?" into the docs lane.
   */
  readonly routes: RegExp | null;
  readonly definition: string;
  /** Site-relative docs page, when one exists. */
  readonly docsPath: string | null;
}

const TIER_IDS = [
  'gruenerator-small',
  'gruenerator-medium',
  'gruenerator-ultra',
  'gruenerator-panda',
];

/** Names and descriptions from the model catalog — the selector's own wording. */
function tierDefinition(): string {
  const tiers = TIER_IDS.flatMap((id) => {
    const option = MODEL_OPTIONS.find((o) => o.id === id);
    return option ? [`${option.name} (${option.description})`] : [];
  });
  return `Die Stufen des Modellwählers im Chat: ${tiers.join(', ')}; „Automatisch" wählt selbst. Gewählt wird eine Größe, kein Herstellermodell. Panda ist nicht für alle sichtbar: ein Admin der Instanz schaltet die Stufe nach einer Schulung frei; fällt Panda aus, antwortet Ultra. Welche Anbieter dahinterstehen, steht auf der Doku-Seite zu den KI-Modellen.`;
}

export const PRODUCT_GLOSSARY = [
  {
    id: 'modellstufen',
    label: 'Klein/Mittel/Ultra/Panda (Modellstufen)',
    terms: /\b(ultra|panda|modellstufe\w*|modellw[äa]hler\w*|ki-modell\w*|sprachmodell\w*)\b/i,
    routes: /\b(ultra|panda|modellstufe\w*|modellw[äa]hler\w*)\b/i,
    definition: tierDefinition(),
    docsPath: '/docs/chat/ki-modelle',
  },
  {
    id: 'explainable',
    label: 'Explainable',
    terms: /\bexplainables?\b/i,
    routes: /\bexplainables?\b/i,
    definition:
      'Eine Erklärseite in einfacher Sprache mit zwei bis drei gemalten Erklärbildern. Entsteht im Chat (@explainable-erstellen) oder aus einer Antwort über „Als Explainable öffnen" im Dokument-Menü und lässt sich per Link auch mit Menschen ohne Konto teilen.',
    docsPath: '/docs/features/explainables',
  },
  {
    id: 'podcast',
    label: 'Podcast',
    terms: /\bpodcasts?\b/i,
    routes: /\bpodcasts?\b/i,
    definition:
      'Eine Chat- oder Notebook-Antwort als Gespräch zweier KI-Stimmen (Moderation und Erklärung, zwei bis fünf Minuten), erstellt über „Als Podcast anhören" im Dokument-Menü. Das MP3 liegt danach in der Mediathek.',
    docsPath: '/docs/features/podcasts',
  },
  {
    id: 'voice',
    label: 'Grünerator Voice',
    terms: /\b(gr[üu]nerator[- ]voice|vertonen|vertonung)\b/i,
    routes: /\b(gr[üu]nerator[- ]voice|vertonen|vertonung)\b/i,
    definition:
      'Text zu Audio (/voice), etwa eine Vorlesefassung oder Ansage; im Chat über das Werkzeug vertonen.',
    docsPath: '/docs/guides/einsteigerinnen/text-vertonen',
  },
  {
    id: 'oeko-modus',
    label: 'Öko-Modus',
    // `\b` before „Ö" never matches (ASCII word boundary), hence the lookbehind.
    terms: /(?<!\p{L})(ö|oe|o)ko[- ]?modus\b/iu,
    routes: /(?<!\p{L})(ö|oe|o)ko[- ]?modus\b/iu,
    definition:
      'Option der Transkription (Audio verschriftlichen): die Aufnahme geht an GreenPT statt an Voxtral von Mistral. Im Web an, solange „Sprecher*innen erkennen" aus ist.',
    docsPath: '/docs/basics/gruenerator-pro-eu',
  },
  {
    id: 'marktplatz',
    label: 'Marktplatz',
    terms: /\b(marktplatz|agentura)\b/i,
    routes: /\b(marktplatz|agentura)\b/i,
    definition:
      'Das Schaufenster (/marktplatz) für Agents, Rezepte, Vorlagen, Sticker und Hintergründe, mit den Herkünften Offiziell, Landesverband und Öffentlich. Jede Person sieht die Angebote ihres Landes.',
    docsPath: '/docs/features/marktplatz',
  },
  {
    id: 'rezepte',
    label: 'Rezepte',
    terms: /\brezept\w*\b/i,
    routes: null,
    definition:
      'Schreibvorgaben je Textsorte und Plattform (Pressemitteilung, Instagram, Landesverbands-Varianten …), im Chat per @-Erwähnung oder automatisch angewendet; eigene Rezepte lassen sich anlegen und teilen.',
    docsPath: '/docs/guides/fortgeschrittene/eigene-rezepte-erstellen',
  },
  {
    id: 'agents',
    label: 'Agents',
    terms: /\b(agents?|agent(en|innen|\*innen))\b/i,
    routes: null,
    definition:
      'Spezialisierte KI-Persönlichkeiten, z. B. für Landesverbände; eigene Agents lassen sich bauen und teilen. Agents, Rezepte und wiederkehrende Aufgaben heißen zusammen Grüneratoren.',
    docsPath: '/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen',
  },
  {
    id: 'projekte',
    label: 'Projekte',
    terms: /\bprojekte?\b/i,
    routes: null,
    definition:
      'Gemeinsame Arbeitsbereiche fürs Team mit Feed, Kommentaren und geteilten Inhalten (Notebooks, Dokumente, Agents …); persönliche Projekte sind nur für dich.',
    docsPath: '/docs/guides/einsteigerinnen/gemeinsames-projekt-erstellen',
  },
  {
    id: 'papierkorb',
    label: 'Papierkorb',
    terms: /\b(papierkorb|wiederherstell\w*)\b/i,
    routes: /\bpapierkorb\b/i,
    definition:
      'Gelöschte Inhalte liegen 30 Tage im Papierkorb (/papierkorb) und lassen sich bis dahin wiederherstellen; danach sind sie endgültig weg. Leere Chats werden sofort gelöscht.',
    docsPath: '/docs/features/papierkorb',
  },
  {
    id: 'konto',
    label: 'Konto',
    terms: /\b(konto|account|benutzerkonto)\b/i,
    routes: null,
    definition:
      'Einstellungen → Allgemein: ganz oben die Kontodaten aus dem Grünen Login, ganz unten „Konto löschen" — endgültig, ohne Papierkorb. Auch in der App möglich.',
    docsPath: '/docs/sonstiges/einstellungen',
  },
  {
    id: 'app',
    label: 'App (Android/iPhone)',
    terms: /\b(app|handy|smartphone|iphone|ipad|android)\b/i,
    routes: null,
    definition:
      'Die Grünerator-App gibt es für Android (Google Play) und iPhone/iPad (TestFlight); sonst läuft alles im Browser unter gruenerator.eu.',
    docsPath: '/docs/guides/experimentell/android-app-installieren',
  },
  {
    id: 'sharepic-formen',
    label: 'Sharepic-Formen (Steckbrief, Infografik, Faktenbild)',
    terms: /\b(steckbrief\w*|infografik\w*|faktenbild\w*)\b/i,
    routes: /\b(steckbrief\w*|infografik\w*|faktenbild\w*)\b/i,
    definition:
      'Formen im Sharepic-Creator: Steckbrief (eine Person mit „Hallo, ich bin …" und Stichworten mit handgezeichneten Pfeilen), Infografik (Punkte, Schritte oder Mengen mit kleinen gemalten Illustrationen), Faktenbild (gemaltes Foto-Motiv mit Zahl oder Diagramm).',
    docsPath: '/docs/features/sharepics',
  },
] as const satisfies readonly GlossaryEntry[];

export type GlossaryTermId = (typeof PRODUCT_GLOSSARY)[number]['id'];

/** The distinctive glossary terms — the classifier's feature-noun extension. */
export const GLOSSARY_TERM_RE = new RegExp(
  PRODUCT_GLOSSARY.flatMap((e) => (e.routes ? [e.routes.source] : [])).join('|'),
  'iu'
);

const DOCS_SITE_URL = 'https://doku.gruenerator.eu';

function formatEntry(e: (typeof PRODUCT_GLOSSARY)[number]): string {
  return `- ${e.label}: ${e.definition}${e.docsPath ? ` (Doku: ${DOCS_SITE_URL}${e.docsPath})` : ''}`;
}

/** All definitions, one line each — part of the product knowledge block. */
export function formatGlossaryDefinitions(): string {
  return PRODUCT_GLOSSARY.map(formatEntry).join('\n');
}

/** The glossary entries a text names — the definitions this turn needs. */
export function matchGlossary(text: string): (typeof PRODUCT_GLOSSARY)[number][] {
  return PRODUCT_GLOSSARY.filter((e) => e.terms.test(text));
}

/**
 * The loop planner's vocabulary note: every term NAME (~80 tokens), so the
 * model recognises a product question and decides itself whether to look a
 * term up. No call is forced.
 */
export function buildGlossaryVocabularyNote(): string {
  return `

## GRÜNERATOR-BEGRIFFE
Diese Wörter bezeichnen Funktionen des Grünerators: ${PRODUCT_GLOSSARY.map((e) => e.label).join(', ')}. Fragt jemand, was einer davon ist oder wie er funktioniert — oder allgemein, wie der Grünerator etwas macht —, schlag Einzelheiten mit product_knowledge oder gruenerator_docs_search nach. Für Grünerator-Begriffe kein web_search und keine Antwort aus dem Gedächtnis.`;
}

/**
 * The short definitions of the terms a message names (~40 tokens each), for
 * the shared system message — so the planner AND the split-mode writer see
 * them, and the single-pass path too. Empty when the message names none.
 *
 * Inline because the names alone were measured not to be enough (27.10.2026):
 * on `hilfe` turns the model leaned on the docs page map, linked a page and
 * answered „Konto löschen" and „Öko-Modus" from priors without calling a tool.
 */
export function buildGlossaryDefinitionsNote(text: string): string {
  const named = matchGlossary(text);
  if (named.length === 0) return '';
  return `

## GRÜNERATOR-BEGRIFFE IN DIESER NACHRICHT
So heißen diese Wörter im Grünerator — beantworte Fragen danach aus diesen Angaben, nicht aus allgemeinem Wissen:
${named.map(formatEntry).join('\n')}`;
}
