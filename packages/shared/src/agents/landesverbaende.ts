import { type NotebookId } from '../notebooks/index.js';

/**
 * Canonical registry of every Landesverband (plus Österreich). This is the
 * SINGLE SOURCE OF TRUTH for the LV↔notebook↔agents relationship — the hub
 * (`landesverbandHubs.ts`), the generated Bürger*innenanfragen agents
 * (`lvBuergerAgents.ts`) and the notebook pin on the hand-tuned PR agents
 * (`oeffentlichkeitsarbeitAgents.ts`) all DERIVE from it.
 *
 * Why this exists: each LV's two specialist agents must appear on the LV
 * notebook page, which lists an agent only when `defaultNotebookId === notebookId`
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
  /**
   * Branded hub: `/agents/<slug>` opens a landing offering both agents. Absent
   * when the LV has no hub yet (e.g. Schleswig-Holstein, notebook disabled).
   * `slug` is intentionally decoupled from `id` (MV's id is
   * `mecklenburg-vorpommern` but its shared link is `gruene-mv`).
   */
  hub?: { slug: string; name: string };
}

export const LANDESVERBAENDE = [
  {
    id: 'berlin',
    title: 'Berlin',
    codes: ['BE', 'BE-F'],
    notebookId: 'berlin-notebook',
    homepage: 'https://gruene.berlin',
    themes:
      'Mieten und bezahlbares Wohnen, Verkehrswende und BVG, lebenswerte Kieze, Kultur und Clubkultur, soziale Gerechtigkeit',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-berlin',
    buergerAgentId: 'gruenerator-buergeranfragen-berlin',
    hub: { slug: 'gruene-berlin', name: 'Grüne Berlin' },
  },
  {
    id: 'hamburg',
    title: 'Hamburg',
    codes: 'HH',
    notebookId: 'hamburg-notebook',
    homepage: 'https://www.gruene-hamburg.de',
    themes:
      'Hafen und maritime Wirtschaft, Verkehrswende und ÖPNV (U5), Wohnen, Klimaschutz, hanseatischer Weg',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
    buergerAgentId: 'gruenerator-buergeranfragen-hamburg',
    hub: { slug: 'gruene-hamburg', name: 'Grüne Hamburg' },
  },
  {
    id: 'mecklenburg-vorpommern',
    title: 'Mecklenburg-Vorpommern',
    codes: ['MV', 'MV-F'],
    notebookId: 'mecklenburg-vorpommern-notebook',
    homepage: 'https://gruene-mv.de',
    themes:
      'Energiewende und Offshore-Windkraft als Wirtschaftsfaktor, Ostsee- und Küstenschutz, ländlicher Raum, Tourismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
    buergerAgentId: 'gruenerator-buergeranfragen-mecklenburg-vorpommern',
    hub: { slug: 'gruene-mv', name: 'Grüne Mecklenburg-Vorpommern' },
  },
  {
    id: 'thueringen',
    title: 'Thüringen',
    codes: ['TH', 'TH-F'],
    notebookId: 'thueringen-notebook',
    homepage: 'https://gruene-thueringen.de',
    themes:
      'Energiewende und Reparaturbonus, Demokratie und Schutz vor Rechtsextremismus, ländlicher Raum, Bildung',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
    buergerAgentId: 'gruenerator-buergeranfragen-thueringen',
    hub: { slug: 'gruene-thueringen', name: 'Grüne Thüringen' },
  },
  {
    id: 'brandenburg',
    title: 'Brandenburg',
    codes: 'BB',
    notebookId: 'brandenburg-notebook',
    homepage: 'https://gruene-brandenburg.de',
    themes:
      'Strukturwandel in der Lausitz (Just Transition Fund), Kita und Bildung, Demokratiearbeit gegen rechte Gewalt, Mobilität (RE3)',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
    buergerAgentId: 'gruenerator-buergeranfragen-brandenburg',
    hub: { slug: 'gruene-brandenburg', name: 'Grüne Brandenburg' },
  },
  {
    id: 'bayern',
    title: 'Bayern',
    codes: ['BY', 'BY-F'],
    notebookId: 'bayern-notebook',
    homepage: 'https://www.gruene-bayern.de',
    themes:
      'Erneuerbare als „Freiheitsenergie" und Wirtschaftsfaktor, Verkehrswende im ländlichen Raum, Alpen- und Naturschutz, bezahlbares Wohnen',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-bayern',
    buergerAgentId: 'gruenerator-buergeranfragen-bayern',
    hub: { slug: 'gruene-bayern', name: 'Grüne Bayern' },
  },
  {
    id: 'sachsen-anhalt',
    title: 'Sachsen-Anhalt',
    codes: ['LSA', 'LSA-F'],
    notebookId: 'sachsen-anhalt-notebook',
    homepage: 'https://www.gruene-lsa.de',
    themes:
      'Energiewende und Wasserstoff (Mitteldeutsches Revier), Strukturwandel und gute Arbeit, Bildung und Kita, ländlicher Raum und Mobilität, Demokratie und Schutz vor Rechtsextremismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt',
    buergerAgentId: 'gruenerator-buergeranfragen-sachsen-anhalt',
    hub: { slug: 'gruene-sachsen-anhalt', name: 'Grüne Sachsen-Anhalt' },
  },
  {
    id: 'hessen',
    title: 'Hessen',
    codes: ['HE', 'HE-F'],
    notebookId: 'hessen-notebook',
    homepage: 'https://www.gruene-hessen.de',
    themes:
      'Verkehrswende und RMV im Rhein-Main-Gebiet, Energiewende und Naturschutz (Wald, Wasser), bezahlbares Wohnen in Frankfurt und den Ballungsräumen, Bildung und Kita, Demokratie und Schutz vor Rechtsextremismus',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hessen',
    buergerAgentId: 'gruenerator-buergeranfragen-hessen',
    hub: { slug: 'gruene-hessen', name: 'Grüne Hessen' },
  },
  {
    id: 'schleswig-holstein',
    title: 'Schleswig-Holstein',
    codes: 'SH',
    notebookId: 'schleswig-holstein-notebook',
    homepage: 'https://sh-gruene.de',
    themes:
      'Energiewende (Windkraft, Wasserstoff), Küstenschutz, Tourismus, Landwirtschaft, dänische Minderheit',
    audience: 'de-DE',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein',
    buergerAgentId: 'gruenerator-buergeranfragen-schleswig-holstein',
    // No hub: the SH notebook is currently disabled in the frontend.
  },
  {
    id: 'oesterreich',
    title: 'Österreich',
    codes: 'AT',
    notebookId: 'oesterreich-notebook',
    homepage: 'https://gruene.at',
    themes:
      'Klimakrise und Energiewende, leistbares Wohnen, Klimaticket und Öffis (ÖBB), Anti-Korruption und Transparenz',
    audience: 'de-AT',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-at',
    buergerAgentId: 'gruenerator-buergeranfragen-oesterreich',
    hub: { slug: 'gruene-oesterreich', name: 'Grüne Österreich' },
  },
] as const satisfies readonly LandesverbandEntry[];

/** notebookId for a given PR agent id — drives the derived `defaultNotebookId`
 *  pin on the hand-tuned Öffentlichkeitsarbeit agents. */
export const LV_NOTEBOOK_BY_PR_AGENT_ID: ReadonlyMap<string, NotebookId> = new Map(
  LANDESVERBAENDE.map((lv) => [lv.prAgentId, lv.notebookId])
);
