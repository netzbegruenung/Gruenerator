import { LANDESVERBAENDE, splitThemes } from './landesverbaende.js';

import type { Agent } from './types.js';

// ─── Per-LV "Wahlprüfsteine"-Agents ───
// Dritter Schwester-Generator neben LV_PR_AGENTS (Pressearbeit) und
// LV_BUERGER_AGENTS (Bürger*innenservice): Verbände, Vereine und Initiativen
// schicken dem Landesverband vor Wahlen Fragenkataloge; dieser Agent formuliert
// die freigabefähige Antwort des Landesverbands, Frage für Frage.
//
// Die Regeln unten sind aus dem Korpus der Berliner Antworten zur
// Abgeordnetenhauswahl 2026 abgeleitet (ADFC, Landessportbund, Mieterverein,
// Kinderschutzbund, Rechtsanwaltskammer, Rat für die Künste) — daher die
// ungewöhnlich harten Vorgaben zu Format-Spiegelung, Antwortlänge und dem
// Umgang mit Zahlenforderungen: Genau daran erkennt ein Verband, ob eine
// Antwort aus dem Landesverband kommt oder generiert wurde.
export const LV_WPS_SPECS = LANDESVERBAENDE.map((lv) => ({
  lv: lv.id,
  title: lv.title,
  codes: lv.codes,
  notebook: lv.notebookId,
  themes: lv.themes,
  ...(lv.audience === 'de-AT' ? { audience: 'de-AT' as const } : {}),
}));

function buildLvWpsOpeningQuestions(spec: (typeof LV_WPS_SPECS)[number]): string[] {
  const topics = splitThemes(spec.themes);
  const [t0, t1] = [topics[0], topics[1] ?? topics[0]];
  return [
    'Beantworte diesen Wahlprüfstein-Katalog: …',
    `Formuliere eine Antwort auf eine These zu ${t0}: …`,
    `Wie antworten wir einem Verband auf die Frage nach ${t1}?`,
    'Prüfe diesen Antwortentwurf auf Stil und Vollständigkeit: …',
  ];
}

export const LV_WPS_AGENTS: Agent[] = LV_WPS_SPECS.map((spec) => {
  const isAT = 'audience' in spec && spec.audience === 'de-AT';
  return {
    identifier: `gruenerator-wahlpruefsteine-${spec.lv}`,
    autoRoutingHint: 'precise',
    audience: isAT ? 'de-AT' : 'de-DE',
    title: `Wahlprüfsteine (${spec.title})`,
    description: `Beantwortet Wahlprüfsteine von Verbänden für die Grünen ${spec.title} — im Format des Katalogs und im Stil des Landesverbands.`,
    systemRole: '',
    defaultRecipeMention: 'wahlpruefstein',
    avatar: '📋',
    backgroundColor: '#316049',
    tags: ['Wahlprüfsteine', 'Verbände', 'Wahlkampf', 'Grüne', spec.title],
    model: 'mistral-large-latest',
    defaultModel: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 8000, temperature: 0.4 },
    openingMessage: `Hallo! Ich beantworte Wahlprüfsteine für die Grünen ${spec.title}.\n\nFüge den Fragenkatalog des Verbands ein — ich recherchiere die Positionen des Landesverbands und beantworte ihn in genau dem Format, in dem er gestellt wurde.`,
    welcomeQuestion: `Welchen Katalog soll ${spec.title} beantworten?`,
    openingQuestions: buildLvWpsOpeningQuestions(spec),
    locale: isAT ? 'de-AT' : 'de-DE',
    author: 'Grünerator',
    // Kein 'web'/'scrape' — siehe lvBuergerAgents: Wahlprüfsteine werden aus
    // dem Landesverbands-Notebook und den Partei-Korpora beantwortet.
    enabledTools: ['search', 'memory', 'self_review'],
    defaultNotebookIds: [spec.notebook],
    // AT-Korpus liegt in einer eigenen Collection ohne `landesverband`-Feld —
    // ein defaultFilter darauf liefe ins Leere. Daher nur für DE-LVs pinnen.
    ...(isAT ? {} : { defaultFilter: { landesverband: spec.codes } }),
    toolRestrictions: isAT
      ? { examplesCountry: 'AT' }
      : { examplesCountry: 'DE', examplesLvScope: spec.codes },
  };
});
