/**
 * Query optimization utilities for WebSearchGraph
 * Handles query enhancement and research question generation
 */

import { parseAIJsonResponse } from '../../../../services/search/index.js';

/**
 * Optimize search query with German synonym expansion
 */
export function optimizeSearchQuery(query: string): string {
  let optimizedQuery = query.trim();

  const synonymMap: Record<string, string> = {
    'verkehrswende': 'verkehrswende mobilität nachhaltiger verkehr',
    'nahverkehr': 'nahverkehr öpnv öffentlicher verkehr',
    'radverkehr': 'radverkehr fahrrad radwege',
    'klimaschutz': 'klimaschutz umweltschutz nachhaltigkeit',
    'energie': 'energie erneuerbare energien energiewende'
  };

  Object.entries(synonymMap).forEach(([term, synonyms]) => {
    if (optimizedQuery.toLowerCase().includes(term)) {
      optimizedQuery = optimizedQuery.replace(
        new RegExp(term, 'gi'),
        synonyms
      );
    }
  });

  // Keep under 400 characters
  if (optimizedQuery.length > 400) {
    optimizedQuery = optimizedQuery.substring(0, 397) + '...';
  }

  return optimizedQuery;
}

/**
 * Generate research questions for deep mode using AI
 */
export async function generateResearchQuestions(
  originalQuery: string,
  aiWorkerPool: any,
  req: any
): Promise<string[]> {
  try {
    const researchSystemPrompt = `Du bist ein Recherche-Experte. Generiere 4-5 strategische Forschungsfragen für eine umfassende Webrecherche.

Die Fragen sollten diese Aspekte abdecken:
1. Hintergrund/Kontext: Was ist der grundlegende Sachverhalt?
2. Aktuelle Entwicklungen: Was passiert gerade zu diesem Thema?
3. Auswirkungen: Welche gesellschaftlichen, ökologischen oder politischen Auswirkungen gibt es?
4. Alternative Perspektiven: Welche anderen Standpunkte gibt es?
5. Zukunftsausblick: Wie könnte sich das Thema entwickeln?

Antworte ausschließlich im JSON-Format: {"research_questions":["Frage 1","Frage 2","Frage 3","Frage 4","Frage 5"]}`;

    const researchPrompt = `Erstelle 4-5 strategische Forschungsfragen für das Thema: "${originalQuery}"

Fokussiere dich auf externe Quellen und verschiedene Perspektiven.`;

    const result = await aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: researchSystemPrompt,
      messages: [{ role: "user", content: researchPrompt }],
      options: {
        provider: 'litellm',
        model: 'gpt-oss:120b',
        max_tokens: 300,
        temperature: 0.3
      }
    }, req);

    if (result.success && result.content) {
      const parsed = parseAIJsonResponse(result.content, {}) as { research_questions?: string[] };
      if (parsed.research_questions && Array.isArray(parsed.research_questions)) {
        return parsed.research_questions.slice(0, 5);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Research question generation error:', errorMessage);
  }

  // Fallback: generate basic questions
  return [
    `${originalQuery} - Hintergrund und Kontext`,
    `${originalQuery} - aktuelle Entwicklungen`,
    `${originalQuery} - gesellschaftliche Auswirkungen`,
    `${originalQuery} - alternative Perspektiven`
  ];
}
