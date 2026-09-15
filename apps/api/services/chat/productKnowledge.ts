/**
 * Product self-knowledge for the chat assistant: what Grünerator itself can do
 * (Grüneratoren, Werkzeuge, MCP-Anbindungen, Wissenssammlungen).
 *
 * One builder, two consumers:
 * - respondNode.buildSystemMessage injects the block when the user asks a
 *   product meta question (covers the CHITCHAT_RE-routed single-pass turns
 *   like "was kannst du", where no tools exist).
 * - toolCatalog mounts it as the `product_knowledge` loop tool (covers loop
 *   turns like "welche MCP-Server kennst du", model-decided).
 */

import { getVisibleSystemAgentsForLocale, isAdminVisibleAgent } from '@gruenerator/shared/agents';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { getMcpExposedCollections } from '../../config/systemCollectionsConfig.js';
import { getHiddenAgentIdentifiersCached } from '../agents/AdminHiddenAgentsService.js';
import { localizePlaceholders } from '../localization/index.js';
import { type Locale } from '../localization/types.js';
import { getManagedConnectors, isSourceGermanOnly } from '../mcp/systemMcpServers.js';

// Meta questions are short; longer texts (pasted documents) are never product
// meta questions, and skipping them keeps the per-turn regex scan bounded.
const MAX_META_QUESTION_LENGTH = 400;

const MCP_RE = /\bmcp\b/i;
const MCP_CONTEXT_RE =
  /\b(server\w*|verbind\w*|verbunden\w*|anbind\w*|angebunden\w*|kennst|nutz\w*|integrier\w*|connector\w*)\b/i;

const PRODUCT_META_PATTERNS: RegExp[] = [
  // End-anchored so content questions ("was kannst du mir über X sagen") stay out.
  /\bwas kannst du( denn| alles| so| eigentlich| hier)*( für (mich|uns))?( tun| machen| anbieten)?\s*[?!.]*$/i,
  /\bwobei kannst du( mir)?( denn| alles)? helfen\b/i,
  /\bwomit kannst du( mir)? helfen\b/i,
  /\bwas (kann|bietet|ist) (der |dieser )?gr[üu]nerator\b/i,
  /\bwie funktioniert (der |dieser )?gr[üu]nerator\b/i,
  /\bhilfe (zum|beim|mit dem) gr[üu]nerator\b/i,
  /\bwelche (funktionen|features|tools|werkzeuge|f[äa]higkeiten|m[öo]glichkeiten|gr[üu]neratoren|agent(en|innen|\*innen)?|mcp[- ]?server)\b/i,
  /\bwie (erstelle|mache|nutze|verwende) (ich|man) (ein|eine|einen|die|das|den)?\s*(sharepic|reel|untertitel|board|tabelle|pr[äa]sentation|notebook|dokument|newsletter|ki-bild)/i,
];

/** Gate for injecting the detailed knowledge block into the system prompt. */
export function isProductMetaQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > MAX_META_QUESTION_LENGTH) return false;
  if (MCP_RE.test(t) && MCP_CONTEXT_RE.test(t)) return true;
  return PRODUCT_META_PATTERNS.some((re) => re.test(t));
}

/** Sub-gate for the connected-servers DB read (only MCP-flavoured questions). */
export function isMcpMetaQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > MAX_META_QUESTION_LENGTH) return false;
  return MCP_RE.test(t) && MCP_CONTEXT_RE.test(t);
}

/**
 * Always-on identity line: fixes the "MCP gehört nicht zu meinem
 * Kompetenzbereich" refusal class even when the meta regex misses.
 *
 * The feature inventory it used to carry (Agentura, Office, Sharepics, Reels,
 * Notebooks, MCP — ~600 characters) is gone. That list is what
 * {@link buildProductKnowledgeBlock} exists for, and that block fires on
 * product questions, where the inventory is actually the answer. Here it rode
 * along on every turn, including "wer war Marilyn Monroe", to prevent a
 * refusal that only needs the first clause. Keep this line SHORT: the moment it
 * grows a list again, it is a second copy of the knowledge block.
 */
export function buildCompactProductIdentity(locale: Locale): string {
  return localizePlaceholders(
    `

## PRODUKT-KONTEXT: GRÜNERATOR
Du bist Teil des Grünerator (gruenerator.eu), des KI-Werkzeugkastens für Aktive {{partyNameGenitive}}. Fragen zum Grünerator und zu seinen Funktionen beantwortest du kompetent statt sie als "nicht mein Kompetenzbereich" abzulehnen (Details & Anleitungen: doku.gruenerator.eu); allgemeiner Technik-Support außerhalb des Grünerators bleibt nicht dein Feld.`,
    locale
  );
}

// Hand-curated summary of the user-facing tool surface; the canonical
// (icon-coupled, web-only) source is apps/web/src/config/workplaceToolsConfig.ts.
const STATIC_TOOL_LINES = [
  '- Dokumente, Boards, Tabellen & Präsentationen: kollaboratives Office mit KI-Bearbeitung',
  '- KI-Bilder: Bildgenerierung im grünen Stil',
  '- Sharepics: Social-Media-Grafiken im Studio, Vorlagen im Grünen-Design',
  '- Reels: automatische Video-Untertitel',
  '- Notebooks & Recherche: eigene Wissenssammlungen plus grüne Inhaltsdatenbank — im Chat lassen sich Notebooks inhaltlich befragen, anlegen, aus einem Wolke-Ordner befüllen, mit Dokumenten ergänzen, in der Sichtbarkeit ändern und mit einem Projekt teilen',
  '- Grüne Wolke: eigene Nextcloud-Freigaben verbinden — Dateien lassen sich im Chat durchsuchen und lesen',
  '- Agentura: spezialisierte Grüneratoren nutzen und eigene Grünerator-Agenten bauen — im Chat lassen sich die eigenen und die aus Projekten geteilten Agenten auflisten, ansehen, aus einer Beschreibung neu anlegen (die Rolle wird entworfen und als Karte bestätigt), ändern, mit einem Projekt teilen und löschen; die System-Grüneratoren selbst sind nicht änderbar',
  '- Rezepte & Textformen (Texte anlernen): Rezepte sind Schreibvorgaben je Textsorte und Plattform, eigene Textformen ein aus Beispieltexten angelernter Stil — im Chat lassen sich alle Rezepte und eigenen Textformen auflisten, eine eigene Textform ansehen, aus Beispielen aus der Nachricht oder einem Anhang anlernen (auch als eigener Stil für ein mitgeliefertes Rezept), um Beispiele ergänzen und löschen; angewendet wird ein Rezept beim Schreiben über @mention oder von selbst',
  '- Wiederkehrende Aufgaben (Agentura): ein Grünerator-Agent läuft von selbst täglich, wöchentlich oder monatlich und liefert das Ergebnis als Dokument, Chat oder Benachrichtigung — im Chat lassen sie sich einrichten (mit Bestätigung), auflisten, ändern, pausieren, sofort ausführen und löschen',
  '- Projekte (Gruppen/Spaces): gemeinsame Arbeitsbereiche im Team — im Chat lassen sich Projekte auflisten, ansehen, ihre geteilten Inhalte durchsehen, anlegen, per Einladungslink beitreten, in Name und Beschreibung ändern und öffentlich listen; Mitglieder verwalten geht nur auf der Projektseite',
  '- Scanner, Transkription, Zeichenzähler: Dokumente digitalisieren, Audio verschriftlichen, Textlängen prüfen',
  '- Monitor: Wahlumfragen, Themen und Stimmungsbilder beobachten',
];

// Gepuffert nach Locale UND dem Stand der ausgeblendeten Agenten: schaltet ein
// Admin einen Agenten weg, darf ihn der Systemprompt nicht weiter anpreisen.
const agentLinesByLocale = new Map<string, string>();

function formatAgentLines(locale: Locale, hiddenIdentifiers: readonly string[]): string {
  const key = `${locale}|${[...hiddenIdentifiers].sort().join(',')}`;
  const cached = agentLinesByLocale.get(key);
  if (cached) return cached;
  const lines = getVisibleSystemAgentsForLocale(locale, CURRENT_INSTANCE)
    .filter((a) => isAdminVisibleAgent(a.identifier, hiddenIdentifiers))
    .map((a) => {
      const desc = a.description.length > 100 ? `${a.description.slice(0, 97)}…` : a.description;
      return `- ${a.title}: ${desc}`;
    })
    .join('\n');
  agentLinesByLocale.set(key, lines);
  return lines;
}

function formatCollectionLine(): string {
  return getMcpExposedCollections()
    .filter((c) => !c.agentOnly)
    .map((c) => c.name)
    .join(', ');
}

/**
 * The first-party MANAGED connectors, with the country caveat where it applies.
 *
 * This block used to list the intent-gated "system MCP sources" and was keyed to
 * `getSystemMcpSources()` directly. Same sources, different door: they are
 * connectors now, on for every user unless switched off, so the heading says
 * what the user actually sees in Einstellungen → Verbindungen.
 *
 * Env still decides existence — an unconfigured connector is absent from
 * `getManagedConnectors()`, so this never advertises a source the deploy lacks.
 */
function formatManagedConnectorLines(locale: Locale): string {
  const connectors = getManagedConnectors();
  if (connectors.length === 0) return '- Aktuell sind keine bereitgestellten Dienste aktiv.';
  return connectors
    .map((c) => {
      const deOnly = locale === 'de-AT' && isSourceGermanOnly(c.key);
      return `- ${c.connector.title}: ${c.capability}${deOnly ? ' (Daten nur für Deutschland)' : ''}`;
    })
    .join('\n');
}

async function formatConnectedServerLines(userId: string): Promise<string> {
  try {
    // Lazy: McpServerRegistry transitively loads DB/auth config at import time,
    // which throws in env-less unit-test contexts (toolCatalog.vitest.ts).
    const { McpServerRegistry } = await import('../mcp/McpServerRegistry.js');
    const servers = (await McpServerRegistry.list(userId)).filter((s) => s.enabled);
    // `list()` now leads with the managed connectors every user gets. They are
    // NOT "verbunden" in the sense the empty-state sentence means, so the
    // invitation to connect one still fires when the user has none of their own.
    const own = servers.filter((s) => !s.managed);
    const lines = servers.map(
      (s) =>
        `- ${s.name}${s.managed ? ' (vom Grünerator bereitgestellt)' : ''}${
          s.toolNames?.length ? ` (Tools: ${s.toolNames.slice(0, 6).join(', ')})` : ''
        }`
    );
    if (own.length === 0) {
      lines.push(
        'Eigene MCP-Server sind aktuell keine verbunden — verbinden unter gruenerator.eu/apps.'
      );
    }
    return lines.join('\n');
  } catch {
    return 'Die verbundenen MCP-Server konnten gerade nicht geladen werden.';
  }
}

/**
 * Detailed knowledge block (~400–700 tokens), assembled from the live
 * registries so it never drifts from the actual feature surface.
 */
export async function buildProductKnowledgeBlock(opts: {
  locale: Locale;
  userId: string | null;
  question: string;
}): Promise<string> {
  const { locale, userId, question } = opts;

  const hiddenAgentIdentifiers = await getHiddenAgentIdentifiersCached();

  const mcpSection =
    isMcpMetaQuestion(question) && userId
      ? `\n\n### Verbundene eigene MCP-Server\n${await formatConnectedServerLines(userId)}`
      : '';

  return `

## GRÜNERATOR-WISSEN (Funktionen des Produkts)

### Grüneratoren (spezialisierte Assistenten, Agentura)
${formatAgentLines(locale, hiddenAgentIdentifiers)}

### Werkzeuge
${STATIC_TOOL_LINES.join('\n')}

### Wissenssammlungen (durchsuchbar in Chat & Notebooks)
${formatCollectionLine()}

### Bereitgestellte Dienste (ohne Einrichtung nutzbar, per @-Erwähnung ansprechbar)
${formatManagedConnectorLines(locale)}${mcpSection}

### Dokumentation gezielt durchsuchen
Die Anleitungen von doku.gruenerator.eu lassen sich direkt im Chat durchsuchen — zwei Wege:
- **@doku tippen** (auch @hilfe oder @anleitung): erzwingt die Doku-Suche für diese Nachricht.
- **Ausdrücklich danach fragen**, und zwar so, dass sowohl die Doku als auch die gemeinte Funktion vorkommen — "Was steht in der Anleitung zu Sharepics?", "Gibt es eine Schritt-für-Schritt-Anleitung für Notebooks?". Ebenso greift eine Wie-Frage zu einer Grünerator-Funktion: "Wie erstelle ich ein Sharepic?", "Wo finde ich die Agentura?". Nennt eine Frage nur die Doku, ohne die Funktion zu benennen, wird nicht zwingend nachgeschlagen — dann hilft @doku.

Die Doku deckt nicht jede Funktion ab und ist an manchen Stellen unvollständig oder älter als das Produkt. Findest du dort nichts Passendes, sag das offen, statt eine Anleitung zu erfinden, und verweise auf die Support-Seite gruenerator.eu/support.

### Grünerator als MCP-Server für externe KI-Chats
Über mcp.gruenerator.eu lassen sich in ChatGPT, Claude und anderen MCP-fähigen Chats nutzen: die grünen Wissenssammlungen, Social-Media-Beispiele und Umfragen, die eigenen Grünerator-Inhalte der angemeldeten Person (Dokumente, Boards und Aufgaben, Notebooks, Projekte, Medien) sowie die Grüneratoren als fertige Prompts. Die Verbindung verlangt eine Anmeldung mit dem Grünerator-Konto; beim Verbinden wird zugestimmt, worauf der Chat zugreifen darf, und die Zustimmung ist jederzeit widerrufbar. Eigene MCP-Server können unter gruenerator.eu/apps verbunden und im Chat per @-Erwähnung genutzt werden. Anleitung: doku.gruenerator.eu.

Beantworte Produktfragen aus diesem Block. Erfinde keine Funktionen, die hier nicht stehen; für Schritt-für-Schritt-Anleitungen verweise auf doku.gruenerator.eu. Wenn jemand fragt, was du kannst oder wobei du hilfst, nenne zum Schluss in einem Satz, dass die Dokumentation direkt im Chat durchsuchbar ist — per @doku oder indem ausdrücklich nach der Anleitung zu einer Funktion gefragt wird.`;
}
