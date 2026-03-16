/**
 * Search Respond Node
 *
 * Prepares a Vane-quality system message for search response generation.
 * Uses XML-formatted results, rich prompts with explicit length/depth/citation
 * requirements, and large context budgets with crawled content prioritization.
 *
 * Outputs a system message in `responseText` — the controller handles streaming.
 */

import { localizePlaceholders } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { truncateDocument } from '../../ChatGraph/nodes/respondNode.js';
import { extractKeyParagraphs } from '../../WebSearchGraph/utilities/contentExtractor.js';

import type { SearchGraphState } from '../types.js';

const log = createLogger('SearchGraph:SearchRespond');

const SEARCH_CONTEXT_BUDGET = 12000;
const MAX_SEARCH_RESULTS = 10;

/**
 * Format search results as XML context with budget-based allocation.
 * Crawled results get 3x weight in budget allocation.
 */
function formatSearchContext(state: SearchGraphState): string {
  const topResults = state.searchResults.slice(0, MAX_SEARCH_RESULTS);
  if (topResults.length === 0) return '';

  // Check if we have enriched (crawled) results
  const enrichedMap = new Map<string, string>();
  if (state.enrichedResults) {
    for (const er of state.enrichedResults) {
      if (er.crawled && er.fullContent && er.url) {
        enrichedMap.set(er.url, er.fullContent);
      }
    }
  }

  // Calculate budget allocation: crawled results get 3x weight
  const weightedRelevance = topResults.map((r) => {
    const base = r.relevance || 0.5;
    const hasCrawled = r.url && enrichedMap.has(r.url);
    const crawlBoost = hasCrawled ? 3 : 1;
    return base * crawlBoost;
  });
  const totalWeight = weightedRelevance.reduce((sum, w) => sum + w, 0);

  const resultsXml = topResults
    .map((r, i) => {
      const charBudget = Math.max(
        300,
        Math.floor((weightedRelevance[i] / totalWeight) * SEARCH_CONTEXT_BUDGET)
      );

      // Use crawled full content if available, otherwise use search snippet
      let content: string;
      const crawledContent = r.url ? enrichedMap.get(r.url) : undefined;
      if (crawledContent) {
        // Extract key paragraphs from crawled content using query relevance
        content = extractKeyParagraphs(crawledContent, state.searchQuery || '', charBudget);
      } else {
        content =
          r.content.length > charBudget ? truncateDocument(r.content, charBudget) : r.content;
      }

      return `<quelle nr="${i + 1}" titel="${escapeXml(r.title)}"${r.url ? ` url="${escapeXml(r.url)}"` : ''}>\n${content}\n</quelle>`;
    })
    .join('\n\n');

  return `\n\n<suchergebnisse hinweis="Zitiere diese Quellen mit [Nummer]-Notation">\n${resultsXml}\n</suchergebnisse>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the system message for web search mode.
 * Inspired by Vane's writer prompt, adapted for German + Green party context.
 */
function buildSearchSystemMessage(state: SearchGraphState): string {
  const sourceCount = Math.min(state.searchResults.length, MAX_SEARCH_RESULTS);
  const locale = state.userLocale || 'de-DE';
  const searchContext = formatSearchContext(state);

  return localizePlaceholders(
    `Du bist ein KI-Suchassistent des Grünerators, der Plattform von {{partyName}}.
Du bist spezialisiert auf fundierte, detaillierte Recherchen mit Quellenangaben.

## AUFGABE
Beantworte die Suchanfrage umfassend und tiefgehend basierend auf den Suchergebnissen.
Schreibe wie einen hochwertigen Artikel mit ansprechendem Erzählfluss.

## QUALITÄTSANFORDERUNGEN
- **Mindestens 400 Wörter.** Oberflächliche Antworten sind nicht akzeptabel.
- Erkläre das Thema tiefgehend mit Analyse, Einordnung und Hintergrundinformationen.
- Erweitere technische oder komplexe Themen so, dass sie für ein allgemeines Publikum verständlich sind.
- Biete verschiedene Perspektiven und ordne Informationen in den größeren Kontext ein.
- Schließe mit einem **zusammenfassenden Absatz**, der die wichtigsten Erkenntnisse einordnet oder nächste Schritte vorschlägt.

## STRUKTUR
- Verwende klare Überschriften (## Überschrift) und Unterüberschriften.
- Strukturiere in zusammenhängende Absätze — keine Listen, es sei denn explizit gefragt.
- Beginne direkt mit dem Inhalt — keine Einleitung wie "Basierend auf den Suchergebnissen..." oder "Hier ist eine Zusammenfassung..."
- Verwende Markdown: **fett** für Hervorhebungen, ## für Überschriften.

## ZITATIONSREGELN
- Dir stehen GENAU ${sourceCount} Quellen zur Verfügung ([1] bis [${sourceCount}]).
- Zitiere **JEDE Aussage** mit [Nummer]-Notation: "Aussage hier [1]."
- **JEDER Satz** in deiner Antwort muss mindestens eine Zitation enthalten.
- Verwende mehrere Quellen pro Aussage wenn möglich: "Fakt hier [1][3]."
- Erfinde KEINE Quellen über [${sourceCount}] hinaus.
- Setze die Nummer DIREKT nach dem Satz, VOR dem Punkt: "Text [1]."
- NIEMALS "laut Quelle", "nach Angaben von" oder "gemäß" — NUR [1], [2] etc.
- Wenn eine Aussage nicht durch die Quellen gestützt wird, weise explizit darauf hin.
${searchContext}`,
    locale
  );
}

/**
 * Build the system message for deep research (dossier) mode.
 */
function buildDeepResearchSystemMessage(state: SearchGraphState): string {
  const sourceCount = Math.min(state.searchResults.length, MAX_SEARCH_RESULTS);
  const locale = state.userLocale || 'de-DE';
  const searchContext = formatSearchContext(state);

  return localizePlaceholders(
    `Du bist ein KI-Recherche-Experte des Grünerators, der Plattform von {{partyName}}.
Du erstellst umfassende Forschungsberichte auf höchstem Niveau.

## AUFGABE
Erstelle einen tiefgehenden, umfassenden Forschungsbericht zur Suchanfrage.
Der Bericht soll wie ein professioneller Analyse-Artikel lesen — detailliert, fundiert, gut strukturiert.

## QUALITÄTSANFORDERUNGEN
- **Mindestens 1500 Wörter.** Dies ist ein Forschungsbericht, keine Kurzzusammenfassung.
- Untersuche das Thema aus **mindestens 3 verschiedenen Perspektiven**.
- Biete tiefgehende Analyse, Einordnung und Hintergrundinformationen.
- Erkläre Zusammenhänge und ordne Informationen in den breiteren Kontext ein.
- Erweitere komplexe Themen so, dass sie für ein allgemeines Publikum verständlich sind.

## STRUKTUR
1. **Zusammenfassung** — Kernaussagen in 2-3 Sätzen
2. **Hintergrund** — Kontext, grundlegende Sachverhalte, historische Einordnung
3. **Aktuelle Entwicklungen** — Was passiert gerade? Neueste Informationen.
4. **Analyse** — Verschiedene Perspektiven, Bewertungen, Einordnungen
5. **Fazit & Ausblick** — Kernerkenntnisse, mögliche Entwicklungen, offene Fragen

Verwende Markdown: ## Überschriften, **fett**, zusammenhängende Absätze.
Beginne direkt — keine meta-Einleitung.

## ZITATIONSREGELN
- Dir stehen GENAU ${sourceCount} Quellen zur Verfügung ([1] bis [${sourceCount}]).
- Zitiere **JEDE Aussage** mit [Nummer]-Notation.
- **JEDER Satz** muss mindestens eine Zitation enthalten.
- Verwende mehrere Quellen pro Aussage wenn möglich: "Fakt [1][3]."
- Erfinde KEINE Quellen über [${sourceCount}] hinaus.
- Format: "Aussage [1]." — Nummer direkt nach dem Satz, vor dem Punkt.
- NIEMALS "laut Quelle" oder "nach Angaben" — NUR [1], [2] etc.
${searchContext}`,
    locale
  );
}

export async function searchRespondNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  if (state.searchResults.length === 0) {
    log.warn('[SearchRespond] No search results — generating response without context');
    return {
      responseText:
        'Du bist ein hilfreicher KI-Assistent. Der Nutzer hat eine Suchanfrage gestellt, aber es wurden keine relevanten Ergebnisse gefunden. Erkläre das freundlich und schlage alternative Suchbegriffe vor.',
      responseTimeMs: Date.now() - start,
    };
  }

  const responseText =
    state.searchMode === 'deep'
      ? buildDeepResearchSystemMessage(state)
      : buildSearchSystemMessage(state);

  const responseTimeMs = Date.now() - start;
  log.info(
    `[SearchRespond] Built system message (${responseText.length} chars, ${state.searchMode} mode, ${state.searchResults.length} results, ${state.enrichedResults?.filter((r) => r.crawled).length || 0} crawled) in ${responseTimeMs}ms`
  );

  return {
    responseText,
    responseTimeMs,
  };
}
