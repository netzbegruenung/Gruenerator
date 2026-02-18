import { MARKDOWN_FORMATTING_INSTRUCTIONS } from '../../../../utils/prompt/index.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';

import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { PRAgentRequest } from '../types.js';

/**
 * Generates strategic framing: narrative, values, audiences, wording
 */
export async function generateStrategicFraming(
  enrichedState: EnrichedState,
  req: any
): Promise<string> {
  console.log('[PR Agent] Generating strategic framing');

  const request = enrichedState.request as PRAgentRequest;

  const systemRole = `Du bist ein erfahrener strategischer Kommunikationsberater für Bündnis 90/Die Grünen.

Deine Aufgabe ist es, das strategische Framing für politische Kommunikation zu entwickeln - bevor die eigentlichen Texte geschrieben werden.

Analysiere das Thema und liefere eine kompakte strategische Einschätzung (1-2 Absätze) mit folgenden Elementen:

1. **Grüner Kern**: Wie verknüpfen wir das Thema mit unseren Grundwerten (Klimaschutz, soziale Gerechtigkeit, Freiheit, wirtschaftliche Modernisierung)?

2. **Zielgruppen-Ansprache**:
   - Wen wollen wir erreichen? (eigene Basis vs. bürgerliche Mitte)
   - Emotionalisierung (Herz) oder Faktenfokus (Kopf)?

3. **Wording**: Welche Begriffe nutzen wir, um das Thema positiv zu besetzen? (z.B. "Schutz" statt "Verbot", "Innovation" statt "Regulierung")

4. **Narrativ**: In einen Satz: Was ist die Geschichte, die wir erzählen wollen?

Sei präzise und strategisch. Dies ist die Grundlage für alle nachfolgenden Kommunikationsmaßnahmen.`;

  const userMessage = `Thema: ${request.inhalt}

Entwickle das strategische Framing für dieses Thema.`;

  const promptResult = await assemblePromptGraphAsync({
    ...enrichedState,
    systemRole,
    request: userMessage,
    constraints: 'Antwort: 1-2 kompakte Absätze, maximal 800 Zeichen.',
    formatting: MARKDOWN_FORMATTING_INSTRUCTIONS,
  });

  const aiResult = await req.app.locals.aiWorkerPool.processRequest(
    {
      type: 'social',
      usePrivacyMode: request.usePrivacyMode || false,
      systemPrompt: promptResult.system,
      messages: promptResult.messages,
      options: {
        max_tokens: 600,
        temperature: 0.7,
        top_p: 0.9,
      },
    },
    req
  );

  return aiResult.content || aiResult.data?.content || '';
}
