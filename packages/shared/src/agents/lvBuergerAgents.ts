import type { Agent } from './types.js';

// ─── Per-LV "Bürger*innenanfragen"-Agents ───
// Schwester-Generator zu LV_PR_AGENTS, aber für Bürger*innen-Service statt
// Pressearbeit: Der Agent recherchiert (search_documents + web_search → die
// Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine
// versandfertige Antwort-E-Mail (Anrede → Dank → Antwort → weiterführende
// Links). Wiederverwendet die bestehenden LV-Notebooks via defaultNotebookId.
export const LV_BUERGER_SPECS = [
  {
    lv: 'berlin',
    title: 'Berlin',
    codes: ['BE', 'BE-F'],
    notebook: 'berlin-notebook',
    homepage: 'https://gruene.berlin',
    themes:
      'Mieten und bezahlbares Wohnen, Verkehrswende und BVG, lebenswerte Kieze, Kultur und Clubkultur, soziale Gerechtigkeit',
  },
  {
    lv: 'hamburg',
    title: 'Hamburg',
    codes: 'HH',
    notebook: 'hamburg-notebook',
    homepage: 'https://www.gruene-hamburg.de',
    themes:
      'Hafen und maritime Wirtschaft, Verkehrswende und ÖPNV (U5), Wohnen, Klimaschutz, hanseatischer Weg',
  },
  {
    lv: 'mecklenburg-vorpommern',
    title: 'Mecklenburg-Vorpommern',
    codes: ['MV', 'MV-F'],
    notebook: 'mecklenburg-vorpommern-notebook',
    homepage: 'https://gruene-mv.de',
    themes:
      'Energiewende und Offshore-Windkraft als Wirtschaftsfaktor, Ostsee- und Küstenschutz, ländlicher Raum, Tourismus',
  },
  {
    lv: 'thueringen',
    title: 'Thüringen',
    codes: ['TH', 'TH-F'],
    notebook: 'thueringen-notebook',
    homepage: 'https://gruene-thueringen.de',
    themes:
      'Energiewende und Reparaturbonus, Demokratie und Schutz vor Rechtsextremismus, ländlicher Raum, Bildung',
  },
  {
    lv: 'brandenburg',
    title: 'Brandenburg',
    codes: 'BB',
    notebook: 'brandenburg-notebook',
    homepage: 'https://gruene-brandenburg.de',
    themes:
      'Strukturwandel in der Lausitz (Just Transition Fund), Kita und Bildung, Demokratiearbeit gegen rechte Gewalt, Mobilität (RE3)',
  },
  {
    lv: 'bayern',
    title: 'Bayern',
    codes: ['BY', 'BY-F'],
    notebook: 'bayern-notebook',
    homepage: 'https://www.gruene-bayern.de',
    themes:
      'Erneuerbare als „Freiheitsenergie" und Wirtschaftsfaktor, Verkehrswende im ländlichen Raum, Alpen- und Naturschutz, bezahlbares Wohnen',
  },
  {
    lv: 'schleswig-holstein',
    title: 'Schleswig-Holstein',
    codes: 'SH',
    notebook: 'schleswig-holstein-notebook',
    homepage: 'https://sh-gruene.de',
    themes:
      'Energiewende (Windkraft, Wasserstoff), Küstenschutz, Tourismus, Landwirtschaft, dänische Minderheit',
  },
  {
    lv: 'oesterreich',
    title: 'Österreich',
    codes: 'AT',
    notebook: 'oesterreich-notebook',
    homepage: 'https://gruene.at',
    themes:
      'Klimakrise und Energiewende, leistbares Wohnen, Klimaticket und Öffis (ÖBB), Anti-Korruption und Transparenz',
    audience: 'de-AT',
  },
] as const satisfies ReadonlyArray<{
  lv: string;
  title: string;
  codes: string | readonly string[];
  notebook: string;
  homepage: string;
  themes: string;
  audience?: 'de-AT';
}>;

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
   - die wichtigsten 1–3 Quell-URLs aus deiner Recherche (nur real recherchierte Links, niemals erfundene)
   - die Website des Landesverbands: ${spec.homepage}
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
    openingQuestions: [
      'Beantworte diese Bürger*innenanfrage: …',
      `Wie steht ${spec.title} zu …?`,
      'Formuliere eine freundliche Antwort auf diese kritische Mail: …',
      'Antworte auf eine Frage zur Verkehrs-/Energiepolitik: …',
    ],
    locale: isAT ? 'de-AT' : 'de-DE',
    author: 'Grünerator',
    enabledTools: ['search', 'web', 'scrape', 'memory', 'self_review'],
    defaultNotebookId: spec.notebook,
    // AT-Korpus liegt in einer eigenen Collection ohne `landesverband`-Feld —
    // ein defaultFilter darauf liefe ins Leere. Daher nur für DE-LVs pinnen.
    ...(isAT ? {} : { defaultFilter: { landesverband: spec.codes } }),
    toolRestrictions: isAT
      ? { examplesCountry: 'AT' }
      : { examplesCountry: 'DE', examplesLvScope: spec.codes },
  };
});
