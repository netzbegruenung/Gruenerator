import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from '../../../../utils/prompt/index.js';
import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';

/**
 * Generates visual briefing: image ideas and timing recommendations
 */
export async function generateVisualBriefing(
  enrichedState: EnrichedState,
  framing: string,
  socialContent: Record<string, string>,
  req: any
): Promise<string> {
  console.log('[PR Agent] Generating visual briefing');

  const request = enrichedState.request as { usePrivacyMode?: boolean };

  const systemRole = `Du bist ein Social Media Manager mit Fokus auf visuelle Kommunikation für die Grünen.

Deine Aufgabe: Konkrete visuelle Empfehlungen und Timing-Strategie entwickeln.

Liefere eine kompakte Empfehlung (1-2 Absätze) mit:

1. **Bildsprache**: Was sollte auf Fotos/Grafiken zu sehen sein?
   - Konkrete Motive (z.B. "Bürger*innengespräch", "Fakten-Grafik mit 3 Kernaussagen")
   - Emotionale Wirkung vs. sachliche Information

2. **Sharepic-Strategie**: Welche Inhalte eignen sich für Grafiken?
   - Zitat-Kachel, Fakten-Grafik, oder Storytelling-Serie?

3. **Timing**: Wann sollte die Kommunikation veröffentlicht werden?
   - Tageszeit (Morgen für Debatte, Abend für Emotion?)
   - Anknüpfung an aktuelle Ereignisse?

Sei konkret und praktisch umsetzbar.`;

  const userMessage = `Strategisches Framing:
${framing}

Social Media Inhalte:
- Instagram: ${socialContent.instagram}
- Facebook: ${socialContent.facebook}

Entwickle visuelle Empfehlungen und Timing-Strategie für diese Kampagne.`;

  const promptResult = await assemblePromptGraphAsync({
    ...enrichedState,
    systemRole,
    request: userMessage,
    constraints: 'Antwort: 1-2 kompakte Absätze, maximal 800 Zeichen.',
    formatting: MARKDOWN_FORMATTING_INSTRUCTIONS
  });

  const aiResult = await req.app.locals.aiWorkerPool.processRequest({
    type: 'social',
    usePrivacyMode: request.usePrivacyMode || false,
    systemPrompt: promptResult.system,
    messages: promptResult.messages,
    options: {
      max_tokens: 600,
      temperature: 0.8,
      top_p: 0.9
    }
  }, req);

  return aiResult.content || aiResult.data?.content || '';
}
