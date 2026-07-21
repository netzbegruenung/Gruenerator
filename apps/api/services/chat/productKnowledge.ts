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

import { getVisibleSystemAgentsForLocale } from '@gruenerator/shared/agents';

import { getMcpExposedCollections } from '../../config/systemCollectionsConfig.js';
import { localizePlaceholders } from '../localization/index.js';
import { type Locale } from '../localization/types.js';
import { DE_ONLY_SYSTEM_INTENTS, getSystemMcpSources } from '../mcp/systemMcpServers.js';

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
 * Always-on identity paragraph (~70 tokens): fixes the "MCP gehört nicht zu
 * meinem Kompetenzbereich" refusal class even when the meta regex misses.
 */
export function buildCompactProductIdentity(locale: Locale): string {
  return localizePlaceholders(
    `

## PRODUKT-KONTEXT: GRÜNERATOR
Du bist Teil des Grünerator (gruenerator.eu), des KI-Werkzeugkastens für Aktive {{partyNameGenitive}}: spezialisierte Grüneratoren (Agentura), Office (Dokumente, Boards, Tabellen, Präsentationen), KI-Bilder & Sharepics, Reels-Untertitel, Notebooks & Recherche in grünen Wissenssammlungen sowie MCP-Anbindungen (Live-Daten im Chat, eigene Server verbinden, Grünerator-Wissen in ChatGPT/Claude). Fragen zum Grünerator selbst beantwortest du kompetent (Details & Anleitungen: docs.gruenerator.eu); allgemeiner Technik-Support außerhalb des Grünerators bleibt nicht dein Feld.`,
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
  '- Notebooks & Recherche: eigene Wissenssammlungen plus grüne Inhaltsdatenbank',
  '- Agentura: spezialisierte Grüneratoren nutzen und eigene Agent*innen erstellen',
  '- Gruppen/Spaces: gemeinsame Arbeitsbereiche im Team',
  '- Scanner, Transkription, Zeichenzähler: Dokumente digitalisieren, Audio verschriftlichen, Textlängen prüfen',
  '- Monitor: Wahlumfragen, Themen und Stimmungsbilder beobachten',
];

const agentLinesByLocale = new Map<Locale, string>();

function formatAgentLines(locale: Locale): string {
  const cached = agentLinesByLocale.get(locale);
  if (cached) return cached;
  const lines = getVisibleSystemAgentsForLocale(locale)
    .map((a) => {
      const desc = a.description.length > 100 ? `${a.description.slice(0, 97)}…` : a.description;
      return `- ${a.title}: ${desc}`;
    })
    .join('\n');
  agentLinesByLocale.set(locale, lines);
  return lines;
}

function formatCollectionLine(): string {
  return getMcpExposedCollections()
    .filter((c) => !c.agentOnly)
    .map((c) => c.name)
    .join(', ');
}

function formatSystemMcpLines(locale: Locale): string {
  const sources = getSystemMcpSources();
  if (sources.length === 0) return '- Aktuell sind keine Live-Daten-Quellen konfiguriert.';
  return sources
    .map((s) => {
      const deOnly = locale === 'de-AT' && DE_ONLY_SYSTEM_INTENTS.has(s.key);
      return `- ${s.name}: ${s.capability}${deOnly ? ' (Daten nur für Deutschland)' : ''}`;
    })
    .join('\n');
}

async function formatConnectedServerLines(userId: string): Promise<string> {
  try {
    // Lazy: McpServerRegistry transitively loads DB/auth config at import time,
    // which throws in env-less unit-test contexts (toolCatalog.vitest.ts).
    const { McpServerRegistry } = await import('../mcp/McpServerRegistry.js');
    const servers = (await McpServerRegistry.list(userId)).filter((s) => s.enabled);
    if (servers.length === 0) {
      return 'Aktuell sind keine eigenen MCP-Server verbunden — verbinden unter gruenerator.eu/apps.';
    }
    return servers
      .map(
        (s) =>
          `- ${s.name}${s.toolNames?.length ? ` (Tools: ${s.toolNames.slice(0, 6).join(', ')})` : ''}`
      )
      .join('\n');
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

  const mcpSection =
    isMcpMetaQuestion(question) && userId
      ? `\n\n### Verbundene eigene MCP-Server\n${await formatConnectedServerLines(userId)}`
      : '';

  return `

## GRÜNERATOR-WISSEN (Funktionen des Produkts)

### Grüneratoren (spezialisierte Assistenten, Agentura)
${formatAgentLines(locale)}

### Werkzeuge
${STATIC_TOOL_LINES.join('\n')}

### Wissenssammlungen (durchsuchbar in Chat & Notebooks)
${formatCollectionLine()}

### Live-Daten im Chat (eingebaute MCP-Quellen)
${formatSystemMcpLines(locale)}${mcpSection}

### Grünerator als MCP-Server für externe KI-Chats
Über mcp.gruenerator.eu lassen sich die grünen Wissenssammlungen in ChatGPT, Claude und anderen MCP-fähigen Chats nutzen. Eigene MCP-Server können unter gruenerator.eu/apps verbunden und im Chat per @-Erwähnung genutzt werden. Anleitung: docs.gruenerator.eu.

Beantworte Produktfragen aus diesem Block. Erfinde keine Funktionen, die hier nicht stehen; für Schritt-für-Schritt-Anleitungen verweise auf docs.gruenerator.eu.`;
}
