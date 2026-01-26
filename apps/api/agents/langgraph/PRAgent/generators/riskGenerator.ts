import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from '../../../../utils/prompt/index.js';
import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';

/**
 * Generates risk analysis: counter-arguments from political opponents
 * Runs AFTER content generation to analyze specific claims
 */
export async function generateRiskAnalysis(
  enrichedState: EnrichedState,
  framing: string,
  socialContent: Record<string, string>,
  pressRelease: string,
  req: any
): Promise<string> {
  console.log('[PR Agent] Generating risk analysis');

  const request = enrichedState.request as { usePrivacyMode?: boolean };

  const systemRole = `Du bist ein kritischer Analyst für politische Kommunikation der Grünen.

Deine Aufgabe: Identifiziere potenzielle Angriffspunkte in der Kommunikation und bereite Counter-Speech vor.

Analysiere die generierten Inhalte und liefere eine kompakte Risiko-Einschätzung (1-2 Absätze):

1. **Counter-Speech**: Was werden politische Gegner (Union, FDP, AfD) voraussichtlich antworten?
2. **Schwachstellen**: Welche Aussagen könnten angegriffen werden?
3. **Sprachregelung**: Wie reagieren wir auf die offensichtlichste Kritik? (2-3 Sätze für Kommentarmoderation)

Sei kritisch und realistisch. Besser vorbereitet als überrascht.`;

  const userMessage = `Strategisches Framing:
${framing}

Generierte Pressemitteilung:
${pressRelease}

Social Media Inhalte:
- Instagram: ${socialContent.instagram}
- Facebook: ${socialContent.facebook}

Analysiere diese Kommunikation auf Risiken und bereite Counter-Speech vor.`;

  const promptResult = await assemblePromptGraphAsync({
    ...enrichedState,
    systemRole,
    request: userMessage,
    constraints: 'Antwort: 1-2 kompakte Absätze, maximal 1000 Zeichen.',
    formatting: MARKDOWN_FORMATTING_INSTRUCTIONS,
  });

  const aiResult = await req.app.locals.aiWorkerPool.processRequest(
    {
      type: 'social',
      usePrivacyMode: request.usePrivacyMode || false,
      systemPrompt: promptResult.system,
      messages: promptResult.messages,
      options: {
        max_tokens: 800,
        temperature: 0.6,
        top_p: 0.85,
      },
    },
    req
  );

  return aiResult.content || aiResult.data?.content || '';
}
