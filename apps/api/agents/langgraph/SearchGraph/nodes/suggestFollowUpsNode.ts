/**
 * Suggest Follow-Ups Node
 *
 * Generates 3 follow-up questions based on the search results and query.
 * These are displayed as clickable suggestion buttons below the answer.
 */

import { parseAIJsonResponse } from '../../../../services/search/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { SearchGraphState } from '../types.js';

const log = createLogger('SearchGraph:SuggestFollowUps');

const SUGGEST_SYSTEM_PROMPT = `Du bist ein Suchassistent. Generiere genau 3 kurze Nachfrage-Vorschläge basierend auf der Suchanfrage und den Ergebnissen.

Regeln:
- Jeder Vorschlag maximal 8 Wörter
- Fragen sollen das Thema vertiefen oder verwandte Aspekte erkunden
- Verwende natürliche, gesprochene Sprache (wie man es in eine Suchleiste tippen würde)
- Keine formellen Fragen mit "Können Sie..." oder "Was ist..."
- Eher: "Finanzierung der Verkehrswende", "Beispiele aus anderen Städten", "Kritik an der Maßnahme"

Antworte ausschließlich im JSON-Format: {"suggestions":["Vorschlag 1","Vorschlag 2","Vorschlag 3"]}`;

export async function suggestFollowUpsNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  if (state.searchResults.length === 0) {
    return { followUpSuggestions: [] };
  }

  try {
    const topTitles = state.searchResults
      .slice(0, 5)
      .map((r) => r.title)
      .join(', ');

    const result = await state.aiWorkerPool.processRequest(
      {
        type: 'text_adjustment',
        systemPrompt: SUGGEST_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Suchanfrage: "${state.searchQuery}"\nGefundene Themen: ${topTitles}`,
          },
        ],
        options: {
          provider: 'litellm',
          model: 'mistral-small',
          max_tokens: 150,
          temperature: 0.5,
        },
      },
      null
    );

    if (result.success && result.content) {
      const parsed = parseAIJsonResponse(result.content, {}) as { suggestions?: string[] };
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        const suggestions = parsed.suggestions.slice(0, 3);
        log.info(`[SuggestFollowUps] Generated ${suggestions.length} suggestions`);
        return { followUpSuggestions: suggestions };
      }
    }

    log.warn('[SuggestFollowUps] Failed to parse suggestions, using empty');
    return { followUpSuggestions: [] };
  } catch (err: unknown) {
    log.warn(`[SuggestFollowUps] Error: ${err instanceof Error ? err.message : err}`);
    return { followUpSuggestions: [] };
  }
}
