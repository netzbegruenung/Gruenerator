import { extractLocaleFromRequest } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import { LOCALE_CONTEXT, REQUEST_TYPE_DISPLAY_NAMES } from '../types.js';

import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { PRAgentRequest } from '../../PRAgent/types.js';
import type { AntragAgentState } from '../types.js';

const log = createLogger('AntragAgent:strategize');

export async function strategizeNode(state: AntragAgentState): Promise<Partial<AntragAgentState>> {
  const startTime = Date.now();
  log.debug('[strategizeNode] Generating argumentation strategy');

  if (!state.enrichedState) {
    log.warn('[strategizeNode] No enriched state available, skipping strategy');
    return {
      strategy: null,
      strategyTimeMs: Date.now() - startTime,
    };
  }

  try {
    const locale = extractLocaleFromRequest(state.req);
    const localeCtx = LOCALE_CONTEXT[locale] || LOCALE_CONTEXT['de-DE'];
    const requestTypeDisplay = REQUEST_TYPE_DISPLAY_NAMES[state.requestType];

    const enrichedWithContext: EnrichedState = {
      ...state.enrichedState,
      knowledge: [
        ...state.enrichedState.knowledge,
        ...(state.researchContext ? [`Recherche-Kontext:\n${state.researchContext}`] : []),
        `Dokumenttyp: ${requestTypeDisplay}. Zuständiges Gremium: ${localeCtx.municipalBody}.`,
      ],
    };

    const request = enrichedWithContext.request as PRAgentRequest;

    let strategyFocus: string;
    switch (state.requestType) {
      case 'kleine_anfrage':
        strategyFocus = `Entwickle eine Argumentationsstrategie für eine Kleine Anfrage. Fokus: Welche konkreten Fakten und Zahlen sollen erfragt werden? ${localeCtx.inquiryReference}. Welche politischen Missstände werden adressiert?`;
        break;
      case 'grosse_anfrage':
        strategyFocus = `Entwickle eine Argumentationsstrategie für eine Große Anfrage mit Debatte im ${localeCtx.municipalBody}. Fokus: Politisches Framing, übergeordnete Themeneinordnung, Verbindung zu grünen Kernwerten und strategische Fragengruppierung.`;
        break;
      default:
        strategyFocus = `Entwickle eine Argumentationsstrategie für einen kommunalpolitischen Antrag. Fokus: Rechtliche Grundlage (${localeCtx.legalBasis}), Kosten-Nutzen-Abwägung, kommunale Präzedenzfälle und politische Argumente.`;
    }

    const systemRole = `Du bist ein erfahrener kommunalpolitischer Berater für {{partyName}} mit Expertise in ${localeCtx.municipalBody}-Arbeit.

${strategyFocus}

Verknüpfe mit grünen Kernwerten (Klimaschutz, soziale Gerechtigkeit, Nachhaltigkeit, Demokratie). Berücksichtige die ${localeCtx.legalBasis} als rechtlichen Rahmen.

Schreibe überwiegend als Fließtext. Nutze Markdown sparsam — nur einzelne **fettgedruckte** Schlüsselbegriffe wo sinnvoll. Keine Überschriften, keine nummerierten Listen.`;

    const promptResult = await assemblePromptGraphAsync({
      ...enrichedWithContext,
      systemRole,
      request: `Thema: ${request.inhalt}\n${state.gliederung ? `Gremium/Gliederung: ${state.gliederung}\n` : ''}\nEntwickle die Argumentationsstrategie als Fließtext.`,
      constraints: 'Maximal 800 Zeichen. Überwiegend Fließtext.',
      formatting:
        'Nutze Markdown sparsam: **fett** nur für Schlüsselbegriffe. Keine Überschriften, keine nummerierten Listen.',
    });

    const aiResult = await state.req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'antrag',
        usePrivacyMode: request.usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 800,
          temperature: 0.5,
          top_p: 0.9,
        },
      },
      state.req
    );

    const strategy = aiResult.content || aiResult.data?.content || '';

    const strategyTimeMs = Date.now() - startTime;
    log.debug(`[strategizeNode] Strategy generated in ${strategyTimeMs}ms`);

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
