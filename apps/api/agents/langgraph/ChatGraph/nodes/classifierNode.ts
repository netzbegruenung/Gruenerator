/**
 * Classifier Node
 *
 * Analyzes user messages to determine the appropriate search intent.
 * This is the entry point of the ChatGraph that routes to search or direct response.
 */

import type { ChatGraphState, SearchIntent, ClassificationResult } from '../types.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * System prompt for intent classification.
 * Designed for fast, accurate classification with minimal tokens.
 */
const CLASSIFIER_PROMPT = `Du analysierst Benutzeranfragen und entscheidest welches Tool benötigt wird.

VERFÜGBARE TOOLS:
- research: Komplexe Fragen, "recherchiere", "suche nach", "finde heraus", mehrere Quellen
- search: Grüne Parteiprogramme, Positionen, Beschlüsse, interne Dokumente
- person: "Wer ist...", Grüne Politiker*innen, MdB, Minister*innen
- web: Aktuelle Nachrichten, externe Fakten, nicht-grüne Themen
- examples: Social-Media-Beispiele, Vorlagen, Posts zum Thema
- direct: Begrüßungen, Dank, kreative Aufgaben OHNE Faktenbedarf

ENTSCHEIDUNGSLOGIK:
1. Explizite Tool-Nennung? → Das genannte Tool
2. "recherchiere/suche/finde" im Text? → research
3. "Wer ist/war..." → person
4. Grüne Politik/Programm/Position? → search
5. Aktuelle News/Web? → web
6. Social-Media-Vorlage/Beispiel? → examples
7. Begrüßung/Dank/Small-Talk? → direct
8. Kreative Aufgabe ohne Fakten (Tweet/Post schreiben)? → direct

Antworte NUR mit JSON im Format:
{"intent": "...", "searchQuery": "...", "reasoning": "..."}

Bei "direct" setze searchQuery auf null.`;

/**
 * Fallback heuristic classification when LLM fails.
 * Uses keyword matching to determine intent.
 */
function heuristicClassify(userContent: string): ClassificationResult {
  const q = userContent.toLowerCase();

  // Check for explicit tool mentions
  if (/\b(recherchiere|recherche|recherchier)\b/.test(q)) {
    return { intent: 'research', searchQuery: userContent, reasoning: 'Explicit research request' };
  }

  // Person queries
  if (/\bwer (ist|war|sind)\b/i.test(q) || /\b(politiker|abgeordnet|minister)\b/i.test(q)) {
    return { intent: 'person', searchQuery: userContent, reasoning: 'Person query detected' };
  }

  // Party document searches
  if (/\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag|grundsatzprogramm)\b/i.test(q)) {
    return { intent: 'search', searchQuery: userContent, reasoning: 'Party document query' };
  }

  // Web/news searches
  if (/\b(aktuell|heute|gestern|news|nachricht|kürzlich)\b/i.test(q)) {
    return { intent: 'web', searchQuery: userContent, reasoning: 'Current events query' };
  }

  // Examples search
  if (/\b(beispiel|vorlage|social media|post|tweet|instagram)\b/i.test(q) && /\b(zeig|such|find)\b/i.test(q)) {
    return { intent: 'examples', searchQuery: userContent, reasoning: 'Social media examples query' };
  }

  // Direct responses (greetings, thanks, simple creative tasks)
  if (/^(hallo|hi|hey|guten|servus|moin|danke|vielen dank)/i.test(q.trim())) {
    return { intent: 'direct', searchQuery: null, reasoning: 'Greeting detected' };
  }

  // Creative tasks without explicit research need
  if (/\b(schreib|erstell|formulier|verfass)\b/i.test(q) && !/\b(recherch|such|find|info)\b/i.test(q)) {
    return { intent: 'direct', searchQuery: null, reasoning: 'Creative task without research need' };
  }

  // Default to direct for unclear queries
  return { intent: 'direct', searchQuery: null, reasoning: 'No clear search intent detected' };
}

/**
 * Parse JSON response from classifier, with error handling.
 */
function parseClassifierResponse(content: string, userContent: string): ClassificationResult {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(content);
    if (parsed.intent && ['research', 'search', 'person', 'web', 'examples', 'direct'].includes(parsed.intent)) {
      return {
        intent: parsed.intent as SearchIntent,
        searchQuery: parsed.searchQuery || (parsed.intent !== 'direct' ? userContent : null),
        reasoning: parsed.reasoning || 'LLM classification',
      };
    }
  } catch {
    // Try to extract JSON from text
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intent) {
          return {
            intent: parsed.intent as SearchIntent,
            searchQuery: parsed.searchQuery || (parsed.intent !== 'direct' ? userContent : null),
            reasoning: parsed.reasoning || 'LLM classification (extracted)',
          };
        }
      } catch {
        // Fall through to heuristic
      }
    }
  }

  // Fallback: try to detect intent from text
  const contentLower = content.toLowerCase();
  if (contentLower.includes('research')) return { intent: 'research', searchQuery: userContent, reasoning: 'Fallback: research detected in response' };
  if (contentLower.includes('person')) return { intent: 'person', searchQuery: userContent, reasoning: 'Fallback: person detected in response' };
  if (contentLower.includes('search')) return { intent: 'search', searchQuery: userContent, reasoning: 'Fallback: search detected in response' };
  if (contentLower.includes('web')) return { intent: 'web', searchQuery: userContent, reasoning: 'Fallback: web detected in response' };
  if (contentLower.includes('examples')) return { intent: 'examples', searchQuery: userContent, reasoning: 'Fallback: examples detected in response' };

  // Use heuristic as final fallback
  return heuristicClassify(userContent);
}

/**
 * Classifier node implementation.
 * Determines user intent using LLM with fast model, falls back to heuristics.
 */
export async function classifierNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Classifier] Starting intent classification');

  try {
    const { messages, aiWorkerPool } = state;

    // Extract user message content
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage?.content || '');

    // Skip classification for very short messages (likely greetings)
    if (userContent.length < 10) {
      log.info('[Classifier] Short message, using heuristic');
      const result = heuristicClassify(userContent);
      return {
        intent: result.intent,
        searchQuery: result.searchQuery,
        reasoning: result.reasoning,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Use AI worker for classification
    // Note: req is null since privacy mode is not used for classification
    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_intent_classification',
        provider: 'mistral',
        systemPrompt: CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: `Analysiere: "${userContent}"` }],
        options: {
          model: 'mistral-small-latest',
          max_tokens: 150,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    // Parse the response
    const classification = parseClassifierResponse(response.content || '', userContent);
    const classificationTimeMs = Date.now() - startTime;

    log.info(
      `[Classifier] Classified as "${classification.intent}" in ${classificationTimeMs}ms: ${classification.reasoning}`
    );

    return {
      intent: classification.intent,
      searchQuery: classification.searchQuery,
      reasoning: classification.reasoning,
      classificationTimeMs,
    };
  } catch (error: any) {
    log.error('[Classifier] Error:', error.message);

    // Fallback to heuristic classification
    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    const userContent =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : '';

    const fallbackResult = heuristicClassify(userContent);

    return {
      intent: fallbackResult.intent,
      searchQuery: fallbackResult.searchQuery,
      reasoning: `Heuristic fallback (error: ${error.message})`,
      classificationTimeMs: Date.now() - startTime,
    };
  }
}
