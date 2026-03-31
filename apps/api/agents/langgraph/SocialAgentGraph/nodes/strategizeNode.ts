import { createLogger } from '../../../../utils/logger.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import { PLATFORM_DISPLAY_NAMES } from '../types.js';

import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { PRAgentRequest } from '../../PRAgent/types.js';
import type { SocialAgentState } from '../types.js';

const log = createLogger('SocialAgent:strategize');

export async function strategizeNode(state: SocialAgentState): Promise<Partial<SocialAgentState>> {
  const startTime = Date.now();
  log.debug('[strategizeNode] Generating communication strategy');

  if (!state.enrichedState) {
    log.warn('[strategizeNode] No enriched state available, skipping strategy');
    return {
      strategy: null,
      strategyTimeMs: Date.now() - startTime,
    };
  }

  try {
    const platformNames = state.platforms.map((p) => PLATFORM_DISPLAY_NAMES[p] || p).join(', ');

    const enrichedWithPlatformContext: EnrichedState = {
      ...state.enrichedState,
      knowledge: [
        ...state.enrichedState.knowledge,
        ...(state.researchContext ? [`Recherche-Kontext:\n${state.researchContext}`] : []),
        `Zielplattformen: ${platformNames}. Berücksichtige plattformspezifische Besonderheiten.`,
      ],
    };

    const request = enrichedWithPlatformContext.request as PRAgentRequest;

    const systemRole = `Du bist ein erfahrener strategischer Kommunikationsberater für {{partyName}}.

Entwickle eine kompakte strategische Einschätzung (1-2 Absätze) zum Thema. Decke dabei ab: Grüner Kern (Verknüpfung mit Grundwerten), Zielgruppe und Ansprache, Wording (positive Begriffe) und das zentrale Narrativ.

Schreibe überwiegend als Fließtext. Nutze Markdown sparsam — nur einzelne **fettgedruckte** Schlüsselbegriffe wo sinnvoll. Keine Überschriften, keine nummerierten Listen.`;

    const promptResult = await assemblePromptGraphAsync({
      ...enrichedWithPlatformContext,
      systemRole,
      request: `Thema: ${request.inhalt}\n\nEntwickle das strategische Framing als Fließtext.`,
      constraints: 'Maximal 800 Zeichen. Überwiegend Fließtext.',
      formatting:
        'Nutze Markdown sparsam: **fett** nur für Schlüsselbegriffe. Keine Überschriften, keine nummerierten Listen.',
    });

    const aiResult = await state.req.app.locals.aiWorkerPool.processRequest(
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
      state.req
    );

    const strategy = aiResult.content || aiResult.data?.content || '';

    const strategyTimeMs = Date.now() - startTime;
    log.debug(
      `[strategizeNode] Strategy generated in ${strategyTimeMs}ms, ` +
        `length=${strategy.length}, preview="${strategy.substring(0, 200)}"`
    );

    return {
      strategy,
      strategyTimeMs,
    };
  } catch (error) {
    log.error('[strategizeNode] Strategy generation failed:', error);
    return {
      strategy: null,
      strategyTimeMs: Date.now() - startTime,
      error: `Strategieerstellung fehlgeschlagen: ${(error as Error).message}`,
    };
  }
}
