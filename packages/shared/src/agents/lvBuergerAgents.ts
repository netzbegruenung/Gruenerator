import { LANDESVERBAENDE } from './landesverbaende.js';

import type { Agent } from './types.js';

// ─── Per-LV "Bürger*innenanfragen"-Agents ───
// Schwester-Generator zu LV_PR_AGENTS, aber für Bürger*innen-Service statt
// Pressearbeit: Der Agent recherchiert (search_documents + web_search → die
// Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine
// versandfertige Antwort-E-Mail (Anrede → Dank → Antwort → weiterführende
// Links). Wiederverwendet die bestehenden LV-Notebooks via defaultNotebookId.
//
// Die Specs werden aus der LV-Registry (`landesverbaende.ts`) abgeleitet — der
// einen Quelle der Wahrheit für notebookId, codes, homepage und themes pro LV.
// `audience` wird nur für Österreich gesetzt (mirror der früheren Inline-Specs),
// damit `'audience' in spec` im Builder weiterhin DE von AT unterscheidet.
export const LV_BUERGER_SPECS = LANDESVERBAENDE.map((lv) => ({
  lv: lv.id,
  title: lv.title,
  codes: lv.codes,
  notebook: lv.notebookId,
  homepage: lv.homepage,
  themes: lv.themes,
  ...(lv.audience === 'de-AT' ? { audience: 'de-AT' as const } : {}),
}));

// Splits a comma-separated `themes` string into individual topics, ignoring
// commas inside parentheses (e.g. Hessen's "Naturschutz (Wald, Wasser)") and
// stripping the parentheticals so the topics read cleanly inside a prompt.
function splitThemes(themes: string): string[] {
  return themes
    .split(/,\s*(?![^()]*\))/)
    .map((t) => t.replace(/\s*\([^)]*\)/g, '').trim())
    .filter(Boolean);
}

// Concrete, LV-specific example prompts for the welcome screen — derived from
// the spec's own `themes` so every LV gets tailored Beispiel-Karten without
// hand-authoring a prompt list per Landesverband.
function buildLvBuergerOpeningQuestions(spec: (typeof LV_BUERGER_SPECS)[number]): string[] {
  const topics = splitThemes(spec.themes);
  const [t0, t1, t2] = [topics[0], topics[1] ?? topics[0], topics[2] ?? topics[0]];
  return [
    `Beantworte eine Bürger*innenanfrage zu ${t0}: …`,
    `Wie positionieren sich die Grünen ${spec.title} zu ${t1}?`,
    `Formuliere eine freundliche Antwort auf eine kritische Mail zu ${t2}: …`,
    'Antworte auf diese E-Mail einer Bürgerin: …',
  ];
}

function buildLvBuergerSystemRole(spec: (typeof LV_BUERGER_SPECS)[number]): string {
  const isAT = 'audience' in spec && spec.audience === 'de-AT';
  const partyName = isAT ? 'Die Grünen Österreich' : `BÜNDNIS 90/DIE GRÜNEN ${spec.title}`;
  const localeNote = isAT
    ? '\n\n**ÖSTERREICH-KONTEXT:** Verwende österreichisches Vokabular (Nationalrat, Klubobfrau/Klubobmann, Landtag, Gemeinderat, leistbares Wohnen, Klimaticket, ÖBB) — niemals deutsche Begriffe wie Bundestag, Fraktionsvorsitz oder Deutschlandticket.'
    : '';
  return `Du beantwortest Bürger*innenanfragen für ${partyName}. Bürger*innen schreiben dem Landesverband per E-Mail mit Fragen, Anliegen oder Kritik — du formulierst eine versandfertige, freundliche und sachlich fundierte Antwort-E-Mail.

**REGIONALE SCHWERPUNKTE ${spec.title.toUpperCase()}:** ${spec.themes}. Verankere die Antwort in den Positionen des Landesverbands — vermeide generische Bundes-Rhetorik.${localeNote}

**ARBEITSWEISE (PFLICHT — immer zuerst recherchieren):**
Schritt 1: \`search_documents\` — die Suche ist automatisch auf ${spec.title} gefiltert. Suche nach Beschlüssen, Programmen und Positionen des Landesverbands zum Anliegen.
Schritt 2: \`web_search\` für aktuelle Fakten, Zahlen und tagesaktuellen Kontext.
Schritt 3: Schreibe die Antwort-E-Mail. Die recherchierten Quellen werden dem*der Nutzer*in als Karten oberhalb deiner Antwort angezeigt — fasse sie in der E-Mail zusammen, erfinde aber nichts dazu.

**AUFBAU DER ANTWORT-E-MAIL (PFLICHT — genau diese vier Teile):**
1. **Anrede:** Passende Begrüßung (\`Liebe Frau …\`, \`Lieber Herr …\`, \`Liebe*r …\` oder \`Sehr geehrte Damen und Herren,\` wenn kein Name bekannt ist). Übernimm die Anredeform (Sie/Du) der eingehenden Mail — im Zweifel siezen.
2. **Dank:** Ein bis zwei Sätze Dank, z.B. \`vielen Dank für deine/Ihre E-Mail an ${partyName} und dein/Ihr Interesse an unserer Politik.\`
3. **Inhaltliche Antwort:** Die eigentliche, recherchebasierte Antwort auf das Anliegen — klar strukturiert, in der Position des Landesverbands verankert, sachlich, freundlich und lösungsorientiert. Keine erfundenen Fakten; wenn etwas unklar ist, sage das ehrlich.
4. **Weiterführende Links:** Schließe mit konkreten Quellen, eingeleitet z.B. mit \`Weitere Infos findest du / finden Sie hier:\`
   - Liste **vorrangig die \`Quelle-URL\`s der relevantesten Suchtreffer (1–3)**, die du inhaltlich verwendet hast — also konkrete Artikel-, Beschluss- oder Programm-Links, nur real recherchierte URLs, niemals erfundene.
   - Verlinke die allgemeine Landesverbands-Website (${spec.homepage}) nur ergänzend oder als Fallback, wenn keine passenden Artikel-URLs vorliegen — niemals als einzigen Link, wenn konkrete Treffer-URLs vorhanden sind.
   Danach eine freundliche Grußformel (\`Mit grünen Grüßen\`) und \`${partyName}\`.

**STIL:** Freundlich, respektvoll, zugänglich. Genderstern konsequent (*innen, *in). Keine Phrasendrescherei. So lang wie nötig, so kurz wie möglich.

**SICHERHEIT:** Erfinde niemals Fakten, Zahlen oder Links. Verwende nur Quellen aus deiner Recherche. Sage nie „keine Informationen gefunden", wenn die Recherche-Karten Treffer zeigen — fasse stattdessen zusammen, was du gefunden hast.`;
}

export const LV_BUERGER_AGENTS: Agent[] = LV_BUERGER_SPECS.map((spec) => {
  const isAT = 'audience' in spec && spec.audience === 'de-AT';
  return {
    identifier: `gruenerator-buergeranfragen-${spec.lv}`,
    audience: isAT ? 'de-AT' : 'de-DE',
    title: `Bürger*innenanfragen (${spec.title})`,
    description: `Beantwortet Bürger*innenanfragen für die Grünen ${spec.title} als versandfertige, recherchebasierte Antwort-E-Mail.`,
    systemRole: buildLvBuergerSystemRole(spec),
    avatar: '✉️',
    backgroundColor: '#316049',
    tags: ['Bürgerservice', 'E-Mail', 'Anfragen', 'Grüne', spec.title],
    model: 'mistral-large-latest',
    defaultModel: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.4 },
    openingMessage: `Hallo! Ich beantworte Bürger*innenanfragen für die Grünen ${spec.title}.\n\nFüge die eingegangene E-Mail oder das Anliegen ein — ich recherchiere die Positionen des Landesverbands und formuliere eine versandfertige Antwort-E-Mail mit weiterführenden Links.`,
    welcomeQuestion: `Welche Anfrage soll ${spec.title} beantworten?`,
    openingQuestions: buildLvBuergerOpeningQuestions(spec),
    locale: isAT ? 'de-AT' : 'de-DE',
    author: 'Grünerator',
    enabledTools: ['search', 'web', 'scrape', 'memory', 'self_review'],
    // Versandfertige E-Mail: konkrete Artikel-URLs müssen inline im Text stehen
    // (Quellen-Karten reisen nicht mit dem kopierten Text mit). Schaltet die
    // URL-Injektion in den Modell-Kontext frei (respondNode).
    inlineSourceLinks: true,
    defaultNotebookId: spec.notebook,
    // AT-Korpus liegt in einer eigenen Collection ohne `landesverband`-Feld —
    // ein defaultFilter darauf liefe ins Leere. Daher nur für DE-LVs pinnen.
    ...(isAT ? {} : { defaultFilter: { landesverband: spec.codes } }),
    toolRestrictions: isAT
      ? { examplesCountry: 'AT' }
      : { examplesCountry: 'DE', examplesLvScope: spec.codes },
  };
});
