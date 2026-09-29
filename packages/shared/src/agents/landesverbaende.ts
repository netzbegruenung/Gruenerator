import { type NotebookId } from '../notebooks/index.js';

/**
 * Canonical registry of every Landesverband (plus Österreich). This is the
 * SINGLE SOURCE OF TRUTH for the LV↔notebook↔agents relationship — the hub
 * (`landesverbandHubs.ts`), the generated Bürger*innenanfragen agents
 * (`lvBuergerAgents.ts`) and the notebook pin on the hand-tuned PR agents
 * (`definitions/gruenerator-oeffentlichkeitsarbeit-*.md`) all DERIVE from it.
 *
 * Why this exists: each LV's specialist agents must appear on the LV
 * notebook page, which lists an agent only when its `defaultNotebookIds` include the notebookId
 * (`NotebookAgentsSection`). The Bürger agents always derived that pin from their
 * spec, but the hand-tuned PR agents typed it by hand — and 8 of them silently
 * omitted it, so only the Bürger agent showed. Deriving every pin from this one
 * table makes that omission impossible.
 */
export interface LandesverbandEntry {
  /** Internal LV id (matches the agent-spec `lv` key, e.g. `mecklenburg-vorpommern`). */
  id: string;
  /** Display name used in agent titles/prompts, e.g. `Berlin`. */
  title: string;
  /**
   * Kürzel in den Rezept-Mentions dieses Verbands (`insta-mv`, `buerger-mv`,
   * `buerger-at`). Mentions sind F0 — das Kürzel wird nicht umbenannt.
   */
  recipeSlug: string;
  /** `landesverband` metadata code(s) for `defaultFilter` / example scoping. */
  codes: string | readonly string[];
  /** The LV notebook both specialist agents pin (and the hub's icon source). */
  notebookId: NotebookId;
  /** Public homepage, surfaced in the Bürger agent's answer template. */
  homepage: string;
  /** Comma-separated regional themes baked into both agents' prompts. */
  themes: string;
  /** User-locale audience — `de-AT` for Österreich, otherwise `de-DE`. */
  audience: 'de-DE' | 'de-AT';
  /** Identifier of the Öffentlichkeitsarbeit agent (Österreich uses `-at`). */
  prAgentId: string;
  /** Identifier of the Bürger*innenanfragen agent. */
  buergerAgentId: string;
  /** Identifier of the Wahlprüfsteine agent. */
  wahlpruefsteinAgentId: string;
  /**
   * Identifier of the Beschlussanträge agent — only where the LV collection holds
   * `content_type: 'beschluss'` documents (`lvFamilyContent.vitest.ts` checks
   * that against the scraper config).
   */
  beschlussAgentId?: string;
  /** Identifier of the Wahlprogramm agent — only where `wahlprogramm` content is indexed. */
  wahlprogrammAgentId?: string;
  /**
   * Branded hub: `/agents/<slug>` opens a landing offering all of the LV's agents.
   *
   * Pflicht für jeden LV, auch bei deaktiviertem Notebook: der Hub ist die
   * einzige Stelle, an der die notebook→agents-Relation steht, und ALLE drei
   * Ausblende-Pfade lesen sie aus `LV_HUBS`. Ein LV ohne Hub lässt sich daher
   * nicht verstecken — seine Spezialagenten bleiben im Inventar stehen.
   *
   * Dass der Hub dadurch nicht selbst zur Hintertür wird, leistet das Gate in
   * `getLandesverbandHubBySlug` (die Auflösung, über die `/agents/:slug`
   * wirklich läuft) — nicht die gleichnamige gefilterte Plural-Variante, die
   * gar keine Aufrufer hat.
   *
   * `slug` ist bewusst von `id` entkoppelt (MVs id ist
   * `mecklenburg-vorpommern`, der geteilte Link aber `gruene-mv`).
   */
  hub: { slug: string; name: string };
}

export const LANDESVERBAENDE = [
  {
    id: 'berlin',
    title: 'Berlin',
    recipeSlug: 'berlin',
    codes: ['BE', 'BE-F'],
    notebookId: 'berlin-notebook',
    homepage: 'https://gruene.berlin',
    themes:
      'Mieten und bezahlbares Wohnen, Verkehrswende und BVG, lebenswerte Kieze, Kultur und Clubkultur, soziale Gerechtigkeit',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-berlin',
    buergerAgentId: 'gruenerator-buergeranfragen-berlin',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-berlin',
    beschlussAgentId: 'gruenerator-beschluesse-berlin',
    wahlprogrammAgentId: 'gruenerator-wahlprogramm-berlin',
    hub: { slug: 'gruene-berlin', name: 'Grüne Berlin' },
  },
  {
    id: 'hamburg',
    title: 'Hamburg',
    recipeSlug: 'hamburg',
    codes: 'HH',
    notebookId: 'hamburg-notebook',
    homepage: 'https://www.gruene-hamburg.de',
    themes:
      'Hafen und maritime Wirtschaft, Verkehrswende und ÖPNV (U5), Wohnen, Klimaschutz, hanseatischer Weg',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
    buergerAgentId: 'gruenerator-buergeranfragen-hamburg',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-hamburg',
    hub: { slug: 'gruene-hamburg', name: 'Grüne Hamburg' },
  },
  {
    id: 'mecklenburg-vorpommern',
    title: 'Mecklenburg-Vorpommern',
    recipeSlug: 'mv',
    codes: ['MV', 'MV-F'],
    notebookId: 'mecklenburg-vorpommern-notebook',
    homepage: 'https://gruene-mv.de',
    themes:
      'Energiewende und Offshore-Windkraft als Wirtschaftsfaktor, Ostsee- und Küstenschutz, ländlicher Raum, Tourismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
    buergerAgentId: 'gruenerator-buergeranfragen-mecklenburg-vorpommern',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-mecklenburg-vorpommern',
    beschlussAgentId: 'gruenerator-beschluesse-mecklenburg-vorpommern',
    hub: { slug: 'gruene-mv', name: 'Grüne Mecklenburg-Vorpommern' },
  },
  {
    id: 'thueringen',
    title: 'Thüringen',
    recipeSlug: 'thueringen',
    codes: ['TH', 'TH-F'],
    notebookId: 'thueringen-notebook',
    homepage: 'https://gruene-thueringen.de',
    themes:
      'Energiewende und Reparaturbonus, Demokratie und Schutz vor Rechtsextremismus, ländlicher Raum, Bildung',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
    buergerAgentId: 'gruenerator-buergeranfragen-thueringen',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-thueringen',
    beschlussAgentId: 'gruenerator-beschluesse-thueringen',
    wahlprogrammAgentId: 'gruenerator-wahlprogramm-thueringen',
    hub: { slug: 'gruene-thueringen', name: 'Grüne Thüringen' },
  },
  {
    id: 'brandenburg',
    title: 'Brandenburg',
    recipeSlug: 'brandenburg',
    codes: 'BB',
    notebookId: 'brandenburg-notebook',
    homepage: 'https://gruene-brandenburg.de',
    themes:
      'Strukturwandel in der Lausitz (Just Transition Fund), Kita und Bildung, Demokratiearbeit gegen rechte Gewalt, Mobilität (RE3)',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
    buergerAgentId: 'gruenerator-buergeranfragen-brandenburg',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-brandenburg',
    beschlussAgentId: 'gruenerator-beschluesse-brandenburg',
    wahlprogrammAgentId: 'gruenerator-wahlprogramm-brandenburg',
    hub: { slug: 'gruene-brandenburg', name: 'Grüne Brandenburg' },
  },
  {
    id: 'bayern',
    title: 'Bayern',
    recipeSlug: 'bayern',
    codes: ['BY', 'BY-F'],
    notebookId: 'bayern-notebook',
    homepage: 'https://www.gruene-bayern.de',
    themes:
      'Erneuerbare als „Freiheitsenergie" und Wirtschaftsfaktor, Verkehrswende im ländlichen Raum, Alpen- und Naturschutz, bezahlbares Wohnen',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-bayern',
    buergerAgentId: 'gruenerator-buergeranfragen-bayern',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-bayern',
    beschlussAgentId: 'gruenerator-beschluesse-bayern',
    wahlprogrammAgentId: 'gruenerator-wahlprogramm-bayern',
    hub: { slug: 'gruene-bayern', name: 'Grüne Bayern' },
  },
  {
    id: 'sachsen-anhalt',
    title: 'Sachsen-Anhalt',
    recipeSlug: 'sachsen-anhalt',
    codes: ['LSA', 'LSA-F'],
    notebookId: 'sachsen-anhalt-notebook',
    homepage: 'https://www.gruene-lsa.de',
    themes:
      'Energiewende und Wasserstoff (Mitteldeutsches Revier), Strukturwandel und gute Arbeit, Bildung und Kita, ländlicher Raum und Mobilität, Demokratie und Schutz vor Rechtsextremismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt',
    buergerAgentId: 'gruenerator-buergeranfragen-sachsen-anhalt',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-sachsen-anhalt',
    beschlussAgentId: 'gruenerator-beschluesse-sachsen-anhalt',
    wahlprogrammAgentId: 'gruenerator-wahlprogramm-sachsen-anhalt',
    hub: { slug: 'gruene-sachsen-anhalt', name: 'Grüne Sachsen-Anhalt' },
  },
  // Sachsen vorerst auskommentiert (#3713): Notebook steht auf `enabled: false`,
  // und für die drei generierten Agenten liegen keine internen Personas vor.
  // {
  //   id: 'sachsen',
  //   title: 'Sachsen',
  //   codes: 'SN',
  //   notebookId: 'sachsen-notebook',
  //   homepage: 'https://gruene-sachsen.de',
  //   themes:
  //     'Strukturwandel in der Lausitz und im Mitteldeutschen Revier, Demokratie und Schutz vor Rechtsextremismus, Bildung und Lehrkräftemangel, Mobilität im ländlichen Raum, sorbisches Leben und Kultur, Natur- und Klimaschutz (Erzgebirge, Elbe)',
  //   audience: 'de-DE',
  //   prAgentId: 'gruenerator-oeffentlichkeitsarbeit-sachsen',
  //   buergerAgentId: 'gruenerator-buergeranfragen-sachsen',
  //   wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-sachsen',
  //   // Hub trotz verstecktem Notebook: die Verstecken-Kaskade in `system.ts` löst
  //   // die Agent-Ids ÜBER LV_HUBS auf — ohne Hub-Eintrag bliebe kein Agent
  //   // verborgen. Dass der Hub selbst nicht durchschlägt, leistet erst das Gate
  //   // in `getLandesverbandHubBySlug`; die gefilterte Plural-Variante hat keine
  //   // Aufrufer und hätte `/agents/gruene-sachsen` offen gelassen.
  //   hub: { slug: 'gruene-sachsen', name: 'Grüne Sachsen' },
  // },
  {
    id: 'hessen',
    title: 'Hessen',
    recipeSlug: 'hessen',
    codes: ['HE', 'HE-F'],
    notebookId: 'hessen-notebook',
    homepage: 'https://www.gruene-hessen.de',
    themes:
      'Verkehrswende und RMV im Rhein-Main-Gebiet, Energiewende und Naturschutz (Wald, Wasser), bezahlbares Wohnen in Frankfurt und den Ballungsräumen, Bildung und Kita, Demokratie und Schutz vor Rechtsextremismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hessen',
    buergerAgentId: 'gruenerator-buergeranfragen-hessen',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-hessen',
    beschlussAgentId: 'gruenerator-beschluesse-hessen',
    hub: { slug: 'gruene-hessen', name: 'Grüne Hessen' },
  },
  {
    id: 'saarland',
    title: 'Saarland',
    recipeSlug: 'saarland',
    codes: 'SL',
    notebookId: 'saarland-notebook',
    homepage: 'https://gruene-saar.de',
    themes:
      'Strukturwandel und Industrie (Stahl, Automobil), Energiewende, Mobilität und ÖPNV (Saarbahn), Bildung, Gesundheit und Krankenhäuser, Grenzregion zu Frankreich',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-saarland',
    buergerAgentId: 'gruenerator-buergeranfragen-saarland',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-saarland',
    beschlussAgentId: 'gruenerator-beschluesse-saarland',
    hub: { slug: 'gruene-saarland', name: 'Grüne Saarland' },
  },
  {
    id: 'schleswig-holstein',
    title: 'Schleswig-Holstein',
    recipeSlug: 'schleswig-holstein',
    codes: 'SH',
    notebookId: 'schleswig-holstein-notebook',
    homepage: 'https://sh-gruene.de',
    themes:
      'Energiewende (Windkraft, Wasserstoff), Küstenschutz, Tourismus, Landwirtschaft, dänische Minderheit',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein',
    buergerAgentId: 'gruenerator-buergeranfragen-schleswig-holstein',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-schleswig-holstein',
    // Hub trotz deaktiviertem Notebook — er IST der Versteck-Schalter, nicht
    // dessen Gegenteil: alle drei Ausblende-Pfade (hiddenFromInventory in
    // `system.ts`, `getLvAgentIdsHiddenIn`, `getHubMemberAgentIds`) lösen die
    // Agent-Ids über LV_HUBS auf. Ohne Eintrag greift keiner davon.
    hub: { slug: 'gruene-schleswig-holstein', name: 'Grüne Schleswig-Holstein' },
  },
  {
    id: 'oesterreich',
    title: 'Österreich',
    recipeSlug: 'at',
    codes: 'AT',
    notebookId: 'oesterreich-notebook',
    homepage: 'https://gruene.at',
    themes:
      'Klimakrise und Energiewende, leistbares Wohnen, Klimaticket und Öffis (ÖBB), Anti-Korruption und Transparenz',
    audience: 'de-AT',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-at',
    buergerAgentId: 'gruenerator-buergeranfragen-oesterreich',
    wahlpruefsteinAgentId: 'gruenerator-wahlpruefsteine-oesterreich',
    hub: { slug: 'gruene-oesterreich', name: 'Grüne Österreich' },
  },
] as const satisfies readonly LandesverbandEntry[];

/**
 * The registry, widened to the declared interface. The literal tuple above has
 * no `beschlussAgentId` key on entries without one, so reading the optional
 * families off it needs an `in` check per site — read them from here instead.
 */
export const LANDESVERBAND_ENTRIES: readonly LandesverbandEntry[] = LANDESVERBAENDE;

/** notebookId for a given PR agent id — drives the derived `defaultNotebookIds`
 *  pin on the hand-tuned Öffentlichkeitsarbeit agents. */
export const LV_NOTEBOOK_BY_PR_AGENT_ID: ReadonlyMap<string, NotebookId> = new Map(
  LANDESVERBAENDE.map((lv) => [lv.prAgentId, lv.notebookId])
);

/** Splits a comma-separated `themes` string into individual topics, ignoring
 *  commas inside parentheses (e.g. Hessen's "Naturschutz (Wald, Wasser)") and
 *  stripping the parentheticals so the topics read cleanly inside a prompt.
 *  Shared by the PR-, Bürger*innen- and Wahlprüfsteine-Agent specs, which all
 *  derive their opening questions from the same `themes` field. */
export function splitThemes(themes: string): string[] {
  return themes
    .split(/,\s*(?![^()]*\))/)
    .map((t) => t.replace(/\s*\([^)]*\)/g, '').trim())
    .filter(Boolean);
}

/**
 * Every agent a Landesverband runs, in hub order. The one list the hiding
 * cascade, the role gate and the hub read — a new family added here reaches
 * all three.
 */
export function landesverbandAgentIds(lv: LandesverbandEntry): string[] {
  return [
    lv.prAgentId,
    lv.buergerAgentId,
    lv.wahlpruefsteinAgentId,
    lv.beschlussAgentId,
    lv.wahlprogrammAgentId,
  ].filter((id): id is string => id !== undefined);
}

/** Hub label per agent family, keyed by the identifier's family segment. */
const LV_AGENT_ROLE_LABELS: Readonly<Record<string, string>> = {
  oeffentlichkeitsarbeit: 'Öffentlichkeitsarbeit',
  buergeranfragen: 'Bürger*innenservice',
  wahlpruefsteine: 'Wahlprüfsteine',
  beschluesse: 'Beschlussanträge',
  wahlprogramm: 'Wahlprogramm',
};

const LV_IDENTIFIER_PREFIX_RE =
  /^gruenerator-(oeffentlichkeitsarbeit|buergeranfragen|wahlpruefsteine|beschluesse|wahlprogramm)-/;

/** Per-Landesverband agents and skills share this identifier prefix family. */
export function isLandesverbandIdentifier(identifier: string): boolean {
  return LV_IDENTIFIER_PREFIX_RE.test(identifier);
}

/** The hub label of an LV agent (`gruenerator-beschluesse-berlin` → `Beschlussanträge`). */
export function landesverbandAgentRole(identifier: string): string | null {
  const family = LV_IDENTIFIER_PREFIX_RE.exec(identifier)?.[1];
  return family ? (LV_AGENT_ROLE_LABELS[family] ?? null) : null;
}

/** The Landesverband slug from an LV identifier (e.g. `…-berlin` → `berlin`). */
export function landesverbandRegion(identifier: string): string {
  return identifier.replace(LV_IDENTIFIER_PREFIX_RE, '');
}

/** Title-case an LV region slug for display (`berlin` → `Berlin`). */
export function landesverbandLabel(identifier: string): string {
  return landesverbandRegion(identifier)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
