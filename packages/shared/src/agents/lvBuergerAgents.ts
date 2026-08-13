import { LANDESVERBAENDE, splitThemes } from './landesverbaende.js';

import type { Agent } from './types.js';

// ─── Per-LV "Bürger*innenanfragen"-Agents ───
// Schwester-Generator zu LV_PR_AGENTS, aber für Bürger*innen-Service statt
// Pressearbeit: Der Agent recherchiert (gruenerator_search + web_search → die
// Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine
// versandfertige Antwort-E-Mail (Anrede → Dank → Antwort → weiterführende
// Links). Wiederverwendet die bestehenden LV-Notebooks via defaultNotebookIds.
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

export const LV_BUERGER_AGENTS: Agent[] = LV_BUERGER_SPECS.map((spec) => {
  const isAT = 'audience' in spec && spec.audience === 'de-AT';
  return {
    identifier: `gruenerator-buergeranfragen-${spec.lv}`,
    audience: isAT ? 'de-AT' : 'de-DE',
    title: `Bürger*innenanfragen (${spec.title})`,
    description: `Beantwortet Bürger*innenanfragen für die Grünen ${spec.title} als versandfertige, recherchebasierte Antwort-E-Mail.`,
    systemRole: '',
    defaultRecipeMention: 'buergermail',
    avatar: '✉️',
    backgroundColor: '#316049',
    tags: ['Bürgerservice', 'E-Mail', 'Anfragen', 'Grüne', spec.title],
    model: 'mistral-large-latest',
    defaultModel: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 8000, temperature: 0.4 },
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
    defaultNotebookIds: [spec.notebook],
    // AT-Korpus liegt in einer eigenen Collection ohne `landesverband`-Feld —
    // ein defaultFilter darauf liefe ins Leere. Daher nur für DE-LVs pinnen.
    ...(isAT ? {} : { defaultFilter: { landesverband: spec.codes } }),
    toolRestrictions: isAT
      ? { examplesCountry: 'AT' }
      : { examplesCountry: 'DE', examplesLvScope: spec.codes },
  };
});
