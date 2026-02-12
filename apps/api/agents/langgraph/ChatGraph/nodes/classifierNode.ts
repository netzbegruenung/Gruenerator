/**
 * Classifier Node
 *
 * Analyzes user messages to determine the appropriate search intent.
 * This is the entry point of the ChatGraph that routes to search or direct response.
 */

import { findBestMatch } from '@gruenerator/shared/utils';

import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState, SearchIntent, ClassificationResult } from '../types.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * System prompt for intent classification.
 * Uses Chain-of-Thought for typo detection and content-type awareness.
 */
const CLASSIFIER_PROMPT = `Du analysierst Benutzeranfragen und entscheidest welches Tool benötigt wird.

VERFÜGBARE TOOLS:
- image: Bildgenerierung - "erstelle Bild", "generiere Bild", "visualisiere", "zeichne", "male"
- research: Komplexe Recherche, faktenbasierte Inhalte, mehrere Quellen
- search: Grüne Parteiprogramme, Positionen, Beschlüsse, interne Dokumente
- web: Aktuelle Nachrichten, externe Fakten, EXPLIZITE Web-Suche ("suche im netz")
- examples: Social-Media-Beispiele, Vorlagen, Posts zum Thema
- direct: Begrüßungen, Dank, rein kreative Aufgaben OHNE Faktenbedarf

SCHRITT 1 - TIPPFEHLER ERKENNEN:
Deutsche Tippfehler-Muster:
- Vertauschte Buchstaben: "recgerchiere" → "recherchiere"
- Fehlende Buchstaben: "recherchier" → "recherchiere"
- Doppelte Buchstaben: "programm" ↔ "program"
- Umlaute: "grüne" = "grune" = "gruene"

SCHRITT 2 - INHALTSTYP ANALYSIEREN:
Manche Inhalte brauchen AUTOMATISCH Recherche:

FAKTENBASIERT (→ research oder web):
- Pressemitteilung, Pressemeldung, PM
- Artikel, Beitrag, Blogpost
- Rede, Ansprache, Statement
- Argumentation, Argumente für/gegen
- Faktencheck, Analyse, Bericht
- "über [Thema]" mit faktischem Thema (Klimapolitik, Energie, etc.)

REIN KREATIV (→ direct):
- Tweet/Post OHNE konkretes Faktorthema
- Slogan, Motto, Claim
- Gedicht, Witz
- Persönliche Nachrichten, Geburtstagskarte

SCHRITT 3 - TOOL WÄHLEN:
1. Bildgenerierung? → image
2. EXPLIZITE Web-Suche ("suche im netz")? → web
3. Faktenbasierter Inhalt über ein Thema? → research
4. Grüne Politik/Programm/Position? → search
5. Aktuelle News/Ereignisse? → web
6. Social-Media-Vorlage suchen? → examples
7. Rein kreativ ohne Fakten? → direct

SCHRITT 4 - SUCHQUERY OPTIMIEREN:
Wenn intent search/research/web/examples ist, erstelle eine optimierte Suchquery:
- Entferne Aufgabenanweisungen (schreib, erstelle, formuliere, verfasse...)
- Behalte NUR das faktische Thema für die Suche
- Beispiel: "Schreib eine Pressemitteilung über die Klimapolitik der Grünen" → "Klimapolitik der Grünen"
- Beispiel: "Erstelle mir Argumente zur Energiewende" → "Energiewende Argumente"
- Beispiel: "Was sagen die Grünen zum Kohleausstieg?" → "Grüne Kohleausstieg Position"

SCHRITT 5 - KOMPLEXE ANFRAGEN ZERLEGEN:
Wenn die Anfrage MEHRERE VERSCHIEDENE Themen vergleicht oder kombiniert:
- Erstelle sub-Queries für jedes einzelne Thema (max 3)
- Beispiel: "Vergleiche die Klima- und Verkehrspolitik" → ["Klimapolitik Grüne", "Verkehrspolitik Grüne"]
- Beispiel: "Energiewende und Kohleausstieg der Grünen" → ["Energiewende Grüne", "Kohleausstieg Grüne"]
- Bei einfachen Anfragen zu einem Thema: setze subQueries auf null

Antworte NUR mit JSON:
{
  "typoAnalysis": {"original": "...", "corrected": "..."} | null,
  "contentType": "pressemitteilung" | "artikel" | "rede" | "argumentation" | "tweet" | "slogan" | null,
  "needsResearch": true | false,
  "intent": "image" | "research" | "search" | "web" | "examples" | "direct",
  "searchQuery": "..." | null,
  "optimizedSearchQuery": "nur das faktische Thema, ohne Aufgabenanweisung" | null,
  "subQueries": ["thema1", "thema2"] | null,
  "reasoning": "..."
}

Bei "direct" und "image" setze searchQuery, optimizedSearchQuery und subQueries auf null.`;

/**
 * Keywords for fuzzy matching in heuristic fallback.
 * Maps intents to their trigger keywords.
 */
const INTENT_KEYWORDS: Record<Exclude<SearchIntent, 'direct'>, string[]> = {
  research: ['recherchiere', 'recherche', 'untersuche', 'analysiere', 'erforsche'],
  image: ['visualisiere', 'zeichne', 'illustriere', 'grafik', 'illustration'],
  web: ['internet', 'netz', 'online', 'aktuell', 'nachricht', 'news'],
  search: ['grüne', 'partei', 'programm', 'position', 'wahlprogramm', 'beschluss'],
  examples: ['beispiel', 'vorlage', 'tweet', 'instagram', 'social'],
};

/**
 * Find intent using fuzzy (Levenshtein-based) matching.
 * Returns the intent if a word matches a keyword with similarity >= threshold.
 *
 * @param word - Single word to match against intent keywords
 * @param threshold - Minimum similarity score (0-1), default 0.75
 * @returns Matched intent or null
 */
function fuzzyMatchIntent(word: string, threshold = 0.75): SearchIntent | null {
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const match = findBestMatch(word, keywords, threshold);
    if (match) {
      log.debug(
        `[Fuzzy] Matched "${word}" to "${match.match}" (${intent}) with score ${match.score.toFixed(2)}`
      );
      return intent as SearchIntent;
    }
  }
  return null;
}

/**
 * Strip German task instruction prefixes from a query to extract just the topic.
 * E.g. "Schreib eine Pressemitteilung über die Klimapolitik" → "Klimapolitik"
 */
function extractSearchTopic(query: string): string {
  // Strip leading task verbs + article/filler words + content type nouns + prepositions
  // Note: preposition alternatives are ordered longest-first to prevent partial matches
  const stripped = query
    .replace(
      /^(schreib|erstell|formulier|verfass|generier|mach|bereite|entwirf|erstelle|schreibe|formuliere|verfasse)[etn]*\s*(mir\s+)?(bitte\s+)?(eine?[nrms]?\s+)?(kurze[nrms]?\s+|lange[nrms]?\s+|ausführliche[nrms]?\s+)?(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report|text|entwurf|zusammenfassung|post|tweet)\s*(über das thema|zu dem thema|zum thema|bezüglich|betreffend|über|zum|zur|zu)?\s*/i,
      ''
    )
    .trim();

  // If we stripped meaningful content and have a result, use it
  if (stripped.length > 3 && stripped.length < query.length * 0.9) {
    return stripped;
  }

  return query;
}

/**
 * Heuristic result with confidence score.
 * Used to decide whether to skip LLM classification.
 */
interface HeuristicResult extends ClassificationResult {
  confidence: number; // 0-1, higher = more certain
}

/**
 * Confidence threshold for skipping LLM.
 * Above this value, we trust heuristics and save an LLM call.
 */
const HEURISTIC_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Heuristic classification with confidence scoring.
 * Returns both the classification and a confidence score (0-1).
 *
 * High confidence (0.9+): Very clear patterns like greetings, explicit requests
 * Medium confidence (0.7-0.9): Keyword matches with some ambiguity
 * Low confidence (<0.7): Fuzzy matches or unclear patterns
 */
function heuristicClassify(userContent: string): HeuristicResult {
  const q = userContent.toLowerCase();

  // High confidence (0.95): Greetings and thanks at start of message
  if (/^(hallo|hi|hey|guten|servus|moin|danke|vielen dank)/i.test(q.trim())) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Greeting detected',
      confidence: 0.95,
    };
  }

  // High confidence (0.92): Image generation requests - very explicit patterns
  // Matches patterns like: "erstelle ein bild von...", "generiere eine grafik"
  const imageKeywords =
    /\b(erstell|generier|visualisier|zeichne|male|illustrier).{0,20}(bild|grafik|illustration|foto|image|poster|sharepic)\b/i;
  const imageKeywordsAlt =
    /\b(bild|grafik|illustration|foto|poster|sharepic).{0,20}(erstell|generier|erzeug|mach)\b/i;
  if (imageKeywords.test(q) || imageKeywordsAlt.test(q)) {
    return {
      intent: 'image',
      searchQuery: null,
      reasoning: 'Image generation request detected',
      confidence: 0.92,
    };
  }

  // High confidence (0.90): Explicit web search request
  // Matches: "suche im netz", "such im internet", "durchsuche das web"
  const explicitWebSearch =
    /\b(such|suche|durchsuche|finde?)\s*(im|das|den|die|in)?\s*(netz|internet|web|online)\b/i;
  if (explicitWebSearch.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Explicit web search request',
      confidence: 0.9,
    };
  }

  // High confidence (0.88): Explicit research request
  if (/\b(recherchiere|recherche|recherchier)\b/.test(q)) {
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Explicit research request',
      confidence: 0.88,
    };
  }

  // Medium-high confidence (0.85): Party document searches - clear Green party keywords
  if (
    /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag|grundsatzprogramm)\b/i.test(q)
  ) {
    return {
      intent: 'search',
      searchQuery: userContent,
      reasoning: 'Party document query',
      confidence: 0.85,
    };
  }

  // Medium confidence (0.80): Web/news searches - could be ambiguous
  if (/\b(aktuell|heute|gestern|news|nachricht|kürzlich)\b/i.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Current events query',
      confidence: 0.8,
    };
  }

  // Medium confidence (0.78): "Wer ist" queries - route to web search
  if (/\bwer (ist|war|sind)\b/i.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Person query routed to web search',
      confidence: 0.78,
    };
  }

  // Medium confidence (0.80): Examples search - requires both keywords
  if (
    /\b(beispiel|vorlage|social media|post|tweet|instagram)\b/i.test(q) &&
    /\b(zeig|such|find)\b/i.test(q)
  ) {
    return {
      intent: 'examples',
      searchQuery: userContent,
      reasoning: 'Social media examples query',
      confidence: 0.8,
    };
  }

  // Medium confidence (0.75): Fact-based content types with topic markers
  const factBasedContent =
    /\b(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report)\b/i;
  const hasTopicMarker = /(?:^|\s)(über|zu|zum|zur|bezüglich|betreffend|thema)(?:\s|$)/i;

  if (factBasedContent.test(q) && hasTopicMarker.test(q)) {
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Fact-based content type with topic detected',
      confidence: 0.75,
    };
  }

  // Medium confidence (0.72): Creative tasks without explicit research need
  if (
    /\b(schreib|erstell|formulier|verfass)[etn]*/i.test(q) &&
    !/\b(recherch|such|find|info)\b/i.test(q)
  ) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Creative task without research need',
      confidence: 0.72,
    };
  }

  // Low confidence (0.65): Fuzzy matching for typos - inherently uncertain
  const words = q.split(/\s+/).filter((w) => w.length >= 4);
  for (const word of words) {
    const fuzzyIntent = fuzzyMatchIntent(word);
    if (fuzzyIntent) {
      return {
        intent: fuzzyIntent,
        searchQuery: fuzzyIntent === 'image' ? null : userContent,
        reasoning: `Fuzzy matched "${word}" to ${fuzzyIntent}`,
        confidence: 0.65,
      };
    }
  }

  // Low confidence (0.50): Default to direct for unclear queries - needs LLM
  return {
    intent: 'direct',
    searchQuery: null,
    reasoning: 'No clear search intent detected',
    confidence: 0.5,
  };
}

/**
 * Extended classifier response with CoT fields.
 */
interface ClassifierLLMResponse {
  typoAnalysis?: { original: string; corrected: string } | null;
  contentType?: string | null;
  needsResearch?: boolean;
  intent: string;
  searchQuery: string | null;
  optimizedSearchQuery?: string | null;
  subQueries?: string[] | null;
  reasoning: string;
}

/**
 * Parse JSON response from classifier, with error handling.
 * Handles extended response format with typoAnalysis and contentType.
 */
function parseClassifierResponse(content: string, userContent: string): ClassificationResult {
  // Valid intents (person removed - feature disabled)
  const validIntents = ['research', 'search', 'web', 'examples', 'image', 'direct'];

  /**
   * Process parsed response and build classification result.
   * Uses optimizedSearchQuery when available for better retrieval precision.
   */
  function processResponse(
    parsed: ClassifierLLMResponse,
    extracted = false
  ): ClassificationResult | null {
    // Log typo detection for debugging
    if (parsed.typoAnalysis) {
      log.debug(
        `[Classifier] Typo detected: "${parsed.typoAnalysis.original}" → "${parsed.typoAnalysis.corrected}"`
      );
    }

    // Log content-type analysis
    if (parsed.contentType) {
      log.debug(
        `[Classifier] Content type: ${parsed.contentType}, needsResearch: ${parsed.needsResearch}`
      );
    }

    // If LLM returns 'person', route to web instead
    if (parsed.intent === 'person') {
      return {
        intent: 'web',
        searchQuery: parsed.optimizedSearchQuery || parsed.searchQuery || userContent,
        reasoning: 'Person intent rerouted to web (feature disabled)',
      };
    }

    if (parsed.intent && validIntents.includes(parsed.intent)) {
      const suffix = extracted ? ' (extracted)' : '';
      const isSearchIntent = !['direct', 'image'].includes(parsed.intent);

      // Prefer optimizedSearchQuery for search intents
      const effectiveSearchQuery = isSearchIntent
        ? parsed.optimizedSearchQuery || parsed.searchQuery || userContent
        : null;

      if (parsed.optimizedSearchQuery && isSearchIntent) {
        log.debug(
          `[Classifier] Query optimized: "${parsed.searchQuery}" → "${parsed.optimizedSearchQuery}"`
        );
      }

      // Extract sub-queries for multi-topic questions
      const subQueries =
        isSearchIntent && parsed.subQueries?.length ? parsed.subQueries.slice(0, 3) : null;

      if (subQueries) {
        log.debug(
          `[Classifier] Decomposed into ${subQueries.length} sub-queries: ${subQueries.join(' | ')}`
        );
      }

      return {
        intent: parsed.intent as SearchIntent,
        searchQuery: effectiveSearchQuery,
        subQueries,
        reasoning: (parsed.reasoning || 'LLM classification') + suffix,
      };
    }

    return null;
  }

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(content) as ClassifierLLMResponse;
    const result = processResponse(parsed);
    if (result) return result;
  } catch {
    // Try to extract JSON from text - handle nested objects with non-greedy match
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as ClassifierLLMResponse;
        const result = processResponse(parsed, true);
        if (result) return result;
      } catch {
        // Try more permissive JSON extraction for nested objects
        const deepJsonMatch = content.match(/\{[\s\S]*\}/);
        if (deepJsonMatch) {
          try {
            const parsed = JSON.parse(deepJsonMatch[0]) as ClassifierLLMResponse;
            const result = processResponse(parsed, true);
            if (result) return result;
          } catch {
            // Fall through to heuristic
          }
        }
      }
    }
  }

  // Fallback: try to detect intent from text
  const contentLower = content.toLowerCase();
  if (contentLower.includes('image'))
    return {
      intent: 'image',
      searchQuery: null,
      reasoning: 'Fallback: image detected in response',
    };
  if (contentLower.includes('research'))
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Fallback: research detected in response',
    };
  if (contentLower.includes('search'))
    return {
      intent: 'search',
      searchQuery: userContent,
      reasoning: 'Fallback: search detected in response',
    };
  if (contentLower.includes('web'))
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Fallback: web detected in response',
    };
  if (contentLower.includes('examples'))
    return {
      intent: 'examples',
      searchQuery: userContent,
      reasoning: 'Fallback: examples detected in response',
    };

  // Use heuristic as final fallback
  return heuristicClassify(userContent);
}

/**
 * Detect query complexity using heuristic patterns.
 * Determines whether a query needs simple, moderate, or complex research depth.
 */
function detectComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const q = query.toLowerCase();

  // Complex: comparison, multi-topic, or explicit detail requests
  if (
    /\b(vergleich|unterschied|pro\s+und\s+contra|gegenüber|im\s+vergleich|versus|vs\.?)\b/i.test(q)
  ) {
    return 'complex';
  }
  if (/\b(detailliert|ausführlich|umfassend|gründlich|tiefgehend|vollständig)\b/i.test(q)) {
    return 'complex';
  }
  // Multi-clause: "und" connecting distinct topics (not just filler)
  if (/\b(einerseits|andererseits|sowohl|als\s+auch)\b/i.test(q)) {
    return 'complex';
  }

  // Simple: greetings, short questions, single-entity lookups
  if (q.length < 30) {
    return 'simple';
  }
  if (/^(hallo|hi|hey|guten|servus|moin|danke)/i.test(q.trim())) {
    return 'simple';
  }
  if (/^(was ist|wer ist|wo ist|wann)\b/i.test(q.trim())) {
    return 'simple';
  }

  return 'moderate';
}

/**
 * Classifier node implementation.
 * Uses heuristics-first approach: high-confidence patterns skip LLM entirely.
 * Falls back to LLM for ambiguous queries where heuristics are uncertain.
 */
export async function classifierNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Classifier] Starting intent classification');

  try {
    const { messages, aiWorkerPool } = state;

    // Extract user message content (handles both string and AI SDK v6 parts format)
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const rawContent = lastUserMessage?.content;
    let userContent: string;
    if (typeof rawContent === 'string') {
      userContent = rawContent;
    } else if (Array.isArray(rawContent)) {
      userContent = rawContent
        .filter((p) => p && typeof p === 'object' && p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
    } else {
      userContent = String(rawContent || '');
    }

    // Analyze temporality and complexity (used by all paths)
    const temporal = analyzeTemporality(userContent);
    const complexity = detectComplexity(userContent);

    // Short messages: always use heuristics (likely greetings)
    if (userContent.length < 10) {
      const result = heuristicClassify(userContent);
      log.info(
        `[Classifier] Short message, heuristics: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`
      );
      return {
        intent: result.intent,
        searchQuery: result.searchQuery,
        reasoning: result.reasoning,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Try heuristics first - check confidence
    const heuristic = heuristicClassify(userContent);

    // High confidence: skip LLM, use heuristics directly
    if (heuristic.confidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      const classificationTimeMs = Date.now() - startTime;

      // Apply query optimization for search intents
      let optimizedQuery = heuristic.searchQuery;
      if (heuristic.searchQuery && !['direct', 'image'].includes(heuristic.intent)) {
        const extracted = extractSearchTopic(heuristic.searchQuery);
        if (extracted !== heuristic.searchQuery) {
          log.debug(
            `[Classifier] Heuristic query optimized: "${heuristic.searchQuery}" → "${extracted}"`
          );
          optimizedQuery = extracted;
        }
      }

      log.info(
        `[Classifier] Heuristics (confidence: ${heuristic.confidence.toFixed(2)}): ${heuristic.intent} - ${heuristic.reasoning}`
      );
      return {
        intent: heuristic.intent,
        searchQuery: optimizedQuery,
        reasoning: `${heuristic.reasoning} (heuristic, confidence: ${heuristic.confidence.toFixed(2)})`,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Low confidence: fall back to LLM for better classification
    log.debug(
      `[Classifier] Low heuristic confidence (${heuristic.confidence.toFixed(2)}), using LLM`
    );

    // Use AI worker for classification
    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_intent_classification',
        provider: 'mistral',
        systemPrompt: CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: `Analysiere: "${userContent}"` }],
        options: {
          model: 'mistral-small-latest',
          max_tokens: 250,
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
      `[Classifier] LLM: ${classification.intent} in ${classificationTimeMs}ms - ${classification.reasoning}`
    );

    return {
      intent: classification.intent,
      searchQuery: classification.searchQuery,
      subQueries: classification.subQueries || null,
      reasoning: classification.reasoning,
      hasTemporal: temporal.hasTemporal,
      complexity,
      classificationTimeMs,
    };
  } catch (error: any) {
    log.error('[Classifier] Error:', error.message);

    // Fallback to heuristic classification
    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    const userContent = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    const fallbackResult = heuristicClassify(userContent);

    return {
      intent: fallbackResult.intent,
      searchQuery: fallbackResult.searchQuery,
      reasoning: `Heuristic fallback (error: ${error.message})`,
      hasTemporal: false,
      complexity: 'moderate' as const,
      classificationTimeMs: Date.now() - startTime,
    };
  }
}

// Export for testing
export {
  heuristicClassify,
  fuzzyMatchIntent,
  extractSearchTopic,
  detectComplexity,
  INTENT_KEYWORDS,
};
