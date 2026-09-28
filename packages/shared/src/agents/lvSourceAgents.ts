import { type LandesverbandContentType } from '../search/collections/landesverbandSources.js';

import {
  type LANDESVERBAENDE,
  LANDESVERBAND_ENTRIES,
  splitThemes,
  type LandesverbandEntry,
} from './landesverbaende.js';

import type { Agent } from './types.js';

// ─── Per-LV agents over ONE content type of the LV collection ───
// Beschlusslage and Wahlprogramm answer from a single kind of document — the
// Landesverband's resolutions, or its election programme — and cite it. Both
// pin that kind on every search (`defaultFilter.content_type`), so a question
// about the programme never grounds in a press release. They exist only where
// the LV collection indexes that content type (`beschlussAgentId` /
// `wahlprogrammAgentId` on the registry entry).
//
// The two families share everything but their wording, so they share one
// builder. Each agent owns exactly one recipe (`<recipePrefix>-<recipeSlug>`),
// which the agentic loop therefore loads up front.

interface SourceFamily {
  idField: 'beschlussAgentId' | 'wahlprogrammAgentId';
  contentType: LandesverbandContentType;
  recipePrefix: string;
  titlePrefix: string;
  avatar: string;
  describe: (lv: string) => string;
  opening: (lv: string) => string;
  welcome: (lv: string) => string;
  questions: (lv: string, topics: readonly string[]) => string[];
  tags: readonly string[];
}

const FAMILIES: readonly SourceFamily[] = [
  {
    idField: 'beschlussAgentId',
    contentType: 'beschluss',
    recipePrefix: 'beschluss',
    titlePrefix: 'Beschlusslage',
    avatar: '📚',
    describe: (lv) =>
      `Sagt belegt, was die Grünen ${lv} beschlossen haben — mit Beschlusstitel, Gremium und Datum — und schreibt auf dieser Grundlage Statements und Argumentationshilfen.`,
    opening: (lv) =>
      `Hallo! Ich kenne die Beschlüsse der Grünen ${lv}.\n\nFrag mich, was der Landesverband zu einem Thema beschlossen hat — ich antworte nur mit Belegen aus den Beschlüssen und sage offen, wo es keine Beschlusslage gibt.`,
    welcome: (lv) => `Zu welchem Thema suchst du die Beschlusslage der Grünen ${lv}?`,
    questions: (lv, [t0, t1, t2]) => [
      `Was haben die Grünen ${lv} zu ${t0} beschlossen?`,
      `Gibt es eine Beschlusslage zu ${t1}?`,
      `Schreib ein kurzes Statement zu ${t2} auf Grundlage unserer Beschlüsse.`,
      'Welche Beschlüsse stützen diese Forderung: …',
    ],
    tags: ['Beschlüsse', 'Beschlusslage', 'Recherche', 'Grüne'],
  },
  {
    idField: 'wahlprogrammAgentId',
    contentType: 'wahlprogramm',
    recipePrefix: 'wahlprogramm',
    titlePrefix: 'Wahlprogramm',
    avatar: '📘',
    describe: (lv) =>
      `Beantwortet Fragen zum Wahlprogramm der Grünen ${lv} mit Kapitel und Wortlaut und prüft Aussagen gegen das Programm.`,
    opening: (lv) =>
      `Hallo! Ich kenne das Wahlprogramm der Grünen ${lv}.\n\nFrag mich, was im Programm steht, oder gib mir eine Aussage zum Prüfen — ich antworte mit der Fundstelle und sage offen, wo das Programm nichts dazu sagt.`,
    welcome: (lv) => `Was möchtest du im Wahlprogramm der Grünen ${lv} nachschlagen?`,
    questions: (lv, [t0, t1, t2]) => [
      `Was steht im Wahlprogramm der Grünen ${lv} zu ${t0}?`,
      `Welche konkreten Maßnahmen verspricht das Programm bei ${t1}?`,
      `Deckt das Wahlprogramm diese Aussage zu ${t2}: …`,
      'Fasse das Kapitel zu … in fünf Punkten zusammen.',
    ],
    tags: ['Wahlprogramm', 'Programm', 'Recherche', 'Grüne'],
  },
];

function buildSourceAgent(family: SourceFamily, lv: LandesverbandEntry, identifier: string): Agent {
  const topics = splitThemes(lv.themes);
  const three = [topics[0] ?? '', topics[1] ?? topics[0] ?? '', topics[2] ?? topics[0] ?? ''];
  return {
    identifier,
    autoRoutingHint: 'precise',
    audience: lv.audience,
    title: `${family.titlePrefix} (${lv.title})`,
    description: family.describe(lv.title),
    systemRole: '',
    defaultRecipeMention: `${family.recipePrefix}-${lv.recipeSlug}`,
    avatar: family.avatar,
    backgroundColor: '#316049',
    tags: [...family.tags, lv.title],
    model: 'mistral-large-latest',
    defaultModel: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 8000, temperature: 0.3 },
    openingMessage: family.opening(lv.title),
    welcomeQuestion: family.welcome(lv.title),
    openingQuestions: family.questions(lv.title, three),
    locale: lv.audience,
    author: 'Grünerator',
    // Kein 'web'/'scrape' — die Antwort kommt aus dem gepinnten Inhaltstyp,
    // nicht aus dem offenen Netz (siehe lvBuergerAgents).
    enabledTools: ['search', 'memory'],
    // Belegte Auskunft: die Fundstellen stehen als Links im Text.
    inlineSourceLinks: true,
    defaultNotebookIds: [lv.notebookId],
    defaultFilter: { landesverband: lv.codes, content_type: [family.contentType] },
    // Nur die eigene Sammlung: der Typ-Pin allein hielte die Suche nicht im
    // Landesverband — `gruenerator_search` böte sonst jede DE-Sammlung an, und
    // Hamburger Beschlüsse stünden als Berliner Beschlusslage da. Der Schlüssel
    // ist die LV-Id (`lvFamilyContent.vitest.ts` prüft, dass er auf die
    // LV-Sammlung zeigt). Deutsche Verbände only: der AT-Korpus trägt weder
    // `landesverband` noch `content_type`, dort liefe jeder Pin ins Leere.
    toolRestrictions: {
      allowedCollections: [lv.id],
      defaultCollection: lv.id,
      examplesCountry: 'DE',
      examplesLvScope: lv.codes,
    },
  };
}

export const LV_SOURCE_AGENTS: Agent[] = FAMILIES.flatMap((family) =>
  LANDESVERBAND_ENTRIES.flatMap((lv) => {
    const identifier = lv[family.idField];
    return identifier ? [buildSourceAgent(family, lv, identifier)] : [];
  })
);

type RegistryEntry = (typeof LANDESVERBAENDE)[number];
export type LvSourceAgentId =
  | Extract<RegistryEntry, { beschlussAgentId: string }>['beschlussAgentId']
  | Extract<RegistryEntry, { wahlprogrammAgentId: string }>['wahlprogrammAgentId'];
