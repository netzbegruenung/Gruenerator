import { createLogger } from '../../../../utils/logger.js';
import { formatSourcesBibliography } from '../../PRAgent/utils/responseFormatter.js';
import { COLLECTION_DISPLAY_NAMES, REQUEST_TYPE_DISPLAY_NAMES } from '../types.js';

import type { ArgumentResult } from '../../PRAgent/generators/argumentsGenerator.js';
import type { AntragAgentState } from '../types.js';

const log = createLogger('AntragAgent:bgdoc');

/**
 * Assembles a structured background document ("Hintergrundpapier") from all
 * intermediate research data in the AntragAgentGraph pipeline.
 * Pure data assembly — no LLM calls.
 */
export function assembleBackgroundDocument(state: AntragAgentState): string {
  const sections: string[] = [];

  // Title section
  const requestTypeDisplay = REQUEST_TYPE_DISPLAY_NAMES[state.requestType] || state.requestType;
  sections.push(`# Hintergrundpapier: ${requestTypeDisplay}`);

  if (state.inhalt) {
    sections.push(`**Thema:** ${state.inhalt}`);
  }
  if (state.gliederung) {
    sections.push(`**Gremium:** ${state.gliederung}`);
  }

  // Strategy section
  if (state.strategy) {
    sections.push(`## Argumentationsstrategie\n\n${state.strategy}`);
  }

  // AI-summarized positions
  if (state.argumentsSummary) {
    sections.push(
      `## Recherchierte Positionen\n\n` +
        `*KI-gestützte Zusammenfassung der Argumente aus grünen Wissensdatenbanken:*\n\n` +
        state.argumentsSummary
    );
  }

  // Individual argument sources — grouped by source name to avoid repetition
  if (state.arguments.length > 0) {
    sections.push(formatArgumentsSection(state.arguments));
  }

  // Enrichment metadata sections (web, documents, texts)
  const metadata = state.enrichedState?.enrichmentMetadata;
  let hasBibliography = false;
  if (metadata) {
    const bibliography = formatSourcesBibliography(metadata);
    if (bibliography) {
      sections.push(bibliography);
      hasBibliography = true;
    }
  }

  // Fallback: if no enrichment bibliography but we have arguments, build minimal sources list
  if (!hasBibliography && state.arguments.length > 0) {
    sections.push(formatFallbackSources(state.arguments));
  }

  // Only return content if we have research data beyond the title
  if (sections.length <= 2) {
    return '';
  }

  const result = sections.join('\n\n');
  log.debug(
    `Assembled ${result.length} chars, first 500: ${result.substring(0, 500).replace(/\n/g, '\\n')}`
  );
  return result;
}

/**
 * Groups arguments by source name and formats them with full metadata.
 * Consecutive arguments from the same source are grouped under one heading
 * instead of repeating the source name for each entry.
 */
function formatArgumentsSection(args: ArgumentResult[]): string {
  const grouped = groupArgumentsBySource(args);
  let section = `## Verwendete Argumente\n`;
  let argNumber = 1;

  for (const group of grouped) {
    const displayName = getCollectionDisplayName(group.arguments[0].metadata?.collection);

    if (group.arguments.length === 1) {
      const arg = group.arguments[0];
      section += `\n### ${argNumber}. ${arg.source}`;
      if (displayName) section += ` (${displayName})`;
      section += '\n';
      section += formatSingleArgument(arg);
      argNumber++;
    } else {
      section += `\n### ${argNumber}–${argNumber + group.arguments.length - 1}. ${group.source}`;
      if (displayName) section += ` (${displayName})`;
      section += `\n*${group.arguments.length} Treffer aus dieser Quelle:*\n`;

      for (let i = 0; i < group.arguments.length; i++) {
        const arg = group.arguments[i];
        section += `\n**Treffer ${i + 1}:**\n`;
        section += formatSingleArgument(arg);
      }
      argNumber += group.arguments.length;
    }
  }

  return section;
}

function formatSingleArgument(arg: ArgumentResult): string {
  let lines = '';
  lines += `- Relevanz: ${Math.round(arg.relevance * 100)}%\n`;

  const displayName = getCollectionDisplayName(arg.metadata?.collection);
  lines += `- Quelle: ${displayName || 'Unbekannt'}\n`;

  if (arg.metadata?.url) {
    lines += `- Link: ${arg.metadata.url}\n`;
  }

  const text = arg.text?.trim();
  if (text) {
    const excerpt = text.length > 300 ? text.substring(0, 300) + '...' : text;
    lines += `- Auszug: ${excerpt}\n`;
  } else {
    lines += `- Auszug: *(Kein Textauszug verfügbar)*\n`;
  }

  return lines;
}

function getCollectionDisplayName(collection: string | undefined): string {
  if (!collection) return '';
  return COLLECTION_DISPLAY_NAMES[collection] || collection;
}

interface ArgumentGroup {
  source: string;
  arguments: ArgumentResult[];
}

function groupArgumentsBySource(args: ArgumentResult[]): ArgumentGroup[] {
  const groups: ArgumentGroup[] = [];
  let currentGroup: ArgumentGroup | null = null;

  for (const arg of args) {
    if (currentGroup && currentGroup.source === arg.source) {
      currentGroup.arguments.push(arg);
    } else {
      currentGroup = { source: arg.source, arguments: [arg] };
      groups.push(currentGroup);
    }
  }

  return groups;
}

/**
 * When enrichment metadata is unavailable, generate a minimal bibliography
 * from the argument results themselves.
 */
function formatFallbackSources(args: ArgumentResult[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  let idx = 1;

  for (const arg of args) {
    const key = arg.metadata?.url || `${arg.source}::${arg.metadata?.collection || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const displayName = getCollectionDisplayName(arg.metadata?.collection);
    let line = `${idx}. **${arg.source}**`;
    if (displayName) line += ` (${displayName})`;
    if (arg.metadata?.url) line += `\n   - URL: ${arg.metadata.url}`;
    lines.push(line);
    idx++;
  }

  if (lines.length === 0) return '';
  return `# Verwendete Quellen\n\n${lines.join('\n')}`;
}
